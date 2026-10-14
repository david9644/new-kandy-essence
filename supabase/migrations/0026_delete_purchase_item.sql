-- New Kandy Essence: delete a SINGLE line from an existing purchase (owner
-- only, Delete PIN required every time -- same pattern as 0025: the PIN check
-- returns a status instead of raising so failed attempts and the lockout
-- persist; business-rule failures raise as before).
--
-- Rules
--   * Refused if any of the line's stock has been used
--     (stock_batches.quantity_remaining < purchase_items.base_quantity), or if
--     the batch is referenced by a stock-out / adjustment / opening-stock row
--     (it could not be removed without leaving those dangling, and an
--     adjustment can hide "used" stock by topping the batch back up). Stock
--     therefore can never go negative.
--   * Refused if it is the purchase's only line -- delete the whole purchase.
--   * Removes the purchase_items row and its stock_batches row, and sets
--     purchases.total_amount to the sum of the remaining line_totals
--     (updated_by / updated_at set like update_purchase_header).
--   * Cheque purchases. create_purchase (0017) also creates the purchase's OWN
--     supplier_payments row for the cheque, so "the cheque is referenced by a
--     supplier payment" is the normal state, not a reason to refuse. Instead the
--     line delete is allowed only when the cheque is still 'pending', has
--     exactly one linked supplier payment, and both that payment's amount and
--     the cheque amount equal the purchase's OLD total -- then the cheque AND
--     that linked payment are set to the NEW total, so the purchase and its
--     payment stay in step. Anything else (cleared / bounced cheque, extra or
--     edited payments, cheque amount different from the total, a new total of
--     0) is refused with an explanation; nothing is guessed.
--     Effect on get_supplier_balance: credit purchase -> balance drops by the
--     line total; cash purchase -> unchanged (cash is not on the balance);
--     cheque purchase -> unchanged (the purchase debit and its payment credit
--     both shrink by the line total).
--   * items.last_purchase_cost: if this line was the item's latest purchase
--     line (nothing created after it) and the item's last_purchase_cost is this
--     line's base-unit cost, it is set back to the previous purchase line's
--     base-unit cost for that item. With no previous line, or if the stored
--     cost is something else (e.g. later set by other means), it is left alone.
--
-- Returns {"ok": true, purchase_id, supplier_id, new_total}, or the PIN
-- failure status.

create function delete_purchase_item(p_purchase_item_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_line purchase_items%rowtype;
  v_purchase purchases%rowtype;
  v_batch stock_batches%rowtype;
  v_cheque cheques%rowtype;
  v_line_count integer;
  v_old_total numeric;
  v_new_total numeric;
  v_pay_count integer;
  v_pay_amount numeric;
  v_base_cost numeric;
  v_prev_cost numeric;
begin
  if not is_owner() then
    raise exception 'only owner can delete purchase lines' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select * into v_line from purchase_items pi where pi.id = p_purchase_item_id;
  if v_line.id is null then
    raise exception 'purchase line not found';
  end if;

  -- Lock the purchase first, then re-read the line (it may have been deleted
  -- by a concurrent call while waiting for the lock).
  select * into v_purchase from purchases p where p.id = v_line.purchase_id for update;
  select * into v_line from purchase_items pi where pi.id = p_purchase_item_id;
  if v_line.id is null then
    raise exception 'purchase line not found';
  end if;

  select * into v_batch from stock_batches sb where sb.id = v_line.stock_batch_id for update;
  if v_batch.id is null then
    raise exception 'cannot delete: the stock batch for this line was not found';
  end if;

  if v_batch.quantity_remaining < v_line.base_quantity then
    raise exception 'cannot delete: stock from this line has already been used';
  end if;

  if exists (select 1 from stock_out_batches sob where sob.stock_batch_id = v_batch.id)
     or exists (select 1 from stock_adjustments sa where sa.stock_batch_id = v_batch.id)
     or exists (select 1 from opening_stock_entries ose where ose.stock_batch_id = v_batch.id) then
    raise exception 'cannot delete: stock from this line has already been used or adjusted';
  end if;

  select count(*) into v_line_count from purchase_items pi where pi.purchase_id = v_purchase.id;
  if v_line_count <= 1 then
    raise exception 'cannot delete: this is the only line on the purchase -- delete the whole purchase instead';
  end if;

  v_old_total := v_purchase.total_amount;
  select coalesce(sum(pi.line_total), 0) into v_new_total
  from purchase_items pi
  where pi.purchase_id = v_purchase.id and pi.id <> v_line.id;

  if v_purchase.payment_type = 'cheque' then
    select * into v_cheque from cheques c where c.id = v_purchase.cheque_id for update;
    if v_cheque.id is null then
      raise exception 'cannot delete: the cheque record for this purchase was not found';
    end if;
    if v_cheque.status <> 'pending' then
      raise exception 'cannot delete: the cheque for this purchase is already %, only a pending cheque can be adjusted', v_cheque.status;
    end if;

    select count(*), max(sp.amount) into v_pay_count, v_pay_amount
    from supplier_payments sp where sp.cheque_id = v_cheque.id;
    if v_pay_count <> 1 or v_pay_amount <> v_old_total then
      raise exception 'cannot delete: the cheque for this purchase is linked to other or edited payments, so it cannot be adjusted automatically';
    end if;

    if v_cheque.amount <> v_old_total then
      raise exception 'cannot delete: the cheque amount (%) does not match the purchase total (%), so it cannot be adjusted automatically', v_cheque.amount, v_old_total;
    end if;

    if v_new_total <= 0 then
      raise exception 'cannot delete: the remaining lines total 0, so the cheque cannot be adjusted -- delete the whole purchase instead';
    end if;
  end if;

  delete from purchase_items where id = v_line.id;
  delete from stock_batches where id = v_line.stock_batch_id;

  update purchases
  set total_amount = v_new_total, updated_by = auth.uid(), updated_at = now()
  where id = v_purchase.id;

  if v_purchase.payment_type = 'cheque' then
    update cheques set amount = v_new_total where id = v_cheque.id;
    update supplier_payments set amount = v_new_total where cheque_id = v_cheque.id;
  end if;

  -- Roll items.last_purchase_cost back only if this line was what set it.
  v_base_cost := v_line.unit_cost / v_line.conversion_factor;
  if exists (
       select 1 from items i
       where i.id = v_line.item_id and i.last_purchase_cost is not distinct from v_base_cost
     )
     and not exists (
       select 1 from purchase_items pi
       where pi.item_id = v_line.item_id and (pi.created_at, pi.id) > (v_line.created_at, v_line.id)
     ) then
    select pi.unit_cost / pi.conversion_factor into v_prev_cost
    from purchase_items pi
    where pi.item_id = v_line.item_id
    order by pi.created_at desc, pi.id desc
    limit 1;

    if found then
      update items
      set last_purchase_cost = v_prev_cost, updated_at = now(), updated_by = auth.uid()
      where id = v_line.item_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'supplier_id', v_purchase.supplier_id,
    'new_total', v_new_total
  );
end;
$$;

-- create function re-triggers this project's default privileges (anon
-- included): revoke from public AND anon explicitly.
revoke all on function delete_purchase_item(uuid, text) from public;
revoke all on function delete_purchase_item(uuid, text) from anon;
grant execute on function delete_purchase_item(uuid, text) to authenticated;
