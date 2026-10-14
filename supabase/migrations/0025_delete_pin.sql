-- New Kandy Essence: owner-only Delete PIN, required for EVERY delete.
--
-- * A separate 4-6 digit PIN (not the login PIN), stored only as a bcrypt
--   hash (pgcrypto crypt/gen_salt) in delete_pin_settings, a single-row table
--   with RLS enabled, NO policies and every API grant revoked -- like
--   profile_credentials, it is only ever touched by the SECURITY DEFINER
--   functions below, so the hash never reaches the browser.
-- * 5 wrong PINs in a row lock deleting for 15 minutes; a correct PIN resets
--   the counter. Until a PIN has been set, every delete is blocked.
-- * Every delete_* RPC gets a p_delete_pin parameter and checks it as the very
--   first thing after is_owner().
--
-- Why the PIN functions RETURN a status instead of raising: a raised
-- exception rolls the whole transaction back, which would also roll back the
-- failed-attempt counter -- the lockout would never trigger. So
-- check_delete_pin() returns {ok, code, message[, locked_until]} (counter
-- changes commit), and each delete_* RPC returns that jsonb as-is when the PIN
-- is not accepted. Business-rule failures (stock already used, not found...)
-- still raise exactly as before.
--
-- Signatures change, so the old PIN-less delete_* functions are DROPPED (no
-- PIN-less version stays callable) and grants are re-applied.

create extension if not exists pgcrypto with schema extensions;

-- ── Storage ──────────────────────────────────────────────────────────────

create table delete_pin_settings (
  id boolean primary key default true check (id),
  pin_hash text,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into delete_pin_settings (id) values (true);

alter table delete_pin_settings enable row level security;
revoke all on delete_pin_settings from public;
revoke all on delete_pin_settings from anon;
revoke all on delete_pin_settings from authenticated;

-- ── Internal check (used by every delete RPC and by set_delete_pin) ─────

create function check_delete_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row delete_pin_settings%rowtype;
  v_failed integer;
  v_locked_until timestamptz;
begin
  if not is_owner() then
    raise exception 'only owner can use the delete PIN' using errcode = '42501';
  end if;

  -- Row lock: concurrent guesses are serialized, so they can't race past the
  -- attempt counter.
  select * into v_row from delete_pin_settings s where s.id for update;

  if v_row.pin_hash is null then
    return jsonb_build_object(
      'ok', false, 'code', 'not_set',
      'message', 'The Delete PIN is not set yet. Set it in Settings first.'
    );
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object(
      'ok', false, 'code', 'locked', 'locked_until', v_row.locked_until,
      'message', 'Too many wrong PINs. Deleting is locked until '
        || to_char(v_row.locked_until at time zone 'Asia/Colombo', 'HH24:MI') || '.'
    );
  end if;

  if p_pin is not null and p_pin ~ '^\d{4,6}$'
     and v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) then
    if v_row.failed_attempts <> 0 or v_row.locked_until is not null then
      update delete_pin_settings s set failed_attempts = 0, locked_until = null where s.id;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  v_failed := v_row.failed_attempts + 1;
  if v_failed >= 5 then
    v_locked_until := now() + interval '15 minutes';
    update delete_pin_settings s set failed_attempts = 0, locked_until = v_locked_until where s.id;
    return jsonb_build_object(
      'ok', false, 'code', 'locked', 'locked_until', v_locked_until,
      'message', 'Too many wrong PINs. Deleting is locked until '
        || to_char(v_locked_until at time zone 'Asia/Colombo', 'HH24:MI') || '.'
    );
  end if;

  update delete_pin_settings s set failed_attempts = v_failed where s.id;
  return jsonb_build_object(
    'ok', false, 'code', 'wrong_pin',
    'message', 'Wrong Delete PIN. ' || (5 - v_failed) || ' '
      || case when 5 - v_failed = 1 then 'try' else 'tries' end
      || ' left before deleting locks for 15 minutes.'
  );
end;
$$;

-- ── Owner-facing RPCs ────────────────────────────────────────────────────

create function has_delete_pin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  return exists (select 1 from delete_pin_settings s where s.pin_hash is not null);
end;
$$;

-- First time: no current PIN needed. Changing: the current Delete PIN is
-- required and counts toward the same 5-wrong-tries lockout.
create function set_delete_pin(p_new_pin text, p_current_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_pin boolean;
  v_check jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can set the delete PIN' using errcode = '42501';
  end if;

  if p_new_pin is null or p_new_pin !~ '^\d{4,6}$' then
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_pin', 'message', 'The Delete PIN must be 4-6 digits.'
    );
  end if;

  select s.pin_hash is not null into v_has_pin from delete_pin_settings s where s.id for update;

  if v_has_pin then
    if p_current_pin is null then
      return jsonb_build_object(
        'ok', false, 'code', 'current_required',
        'message', 'Enter the current Delete PIN to change it.'
      );
    end if;
    v_check := check_delete_pin(p_current_pin);
    if not (v_check->>'ok')::boolean then
      return v_check;
    end if;
  end if;

  update delete_pin_settings s
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
      failed_attempts = 0,
      locked_until = null,
      updated_at = now()
  where s.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Forgotten-PIN reset. NOT callable from the browser: only the service role
-- (the server action that first re-verifies the owner's LOGIN PIN) can run it.
create function admin_reset_delete_pin(p_owner_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles pr where pr.id = p_owner_id and pr.role = 'owner' and pr.active
  ) then
    raise exception 'only an active owner can reset the delete PIN' using errcode = '42501';
  end if;

  if p_new_pin is null or p_new_pin !~ '^\d{4,6}$' then
    raise exception 'The Delete PIN must be 4-6 digits.';
  end if;

  update delete_pin_settings s
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
      failed_attempts = 0,
      locked_until = null,
      updated_at = now()
  where s.id;
end;
$$;

-- ── Delete RPCs: old signatures dropped, new ones take p_delete_pin ─────
-- Bodies are unchanged except for the PIN gate after is_owner() and the
-- trailing `return`. Each returns {"ok": true}, or the PIN failure jsonb.

drop function delete_purchase(uuid);
drop function delete_stock_out(uuid);
drop function delete_opening_stock(uuid);
drop function delete_stock_adjustment(uuid);
drop function delete_supplier_payment(uuid);
drop function delete_customer_credit(uuid);
drop function delete_customer_payment(uuid);
drop function delete_salary_payment(uuid);

create function delete_purchase(p_purchase_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_consumed boolean;
  v_cheque_id uuid;
  v_batch_ids uuid[];
begin
  if not is_owner() then
    raise exception 'only owner can delete purchases' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select array_agg(stock_batch_id) into v_batch_ids
  from purchase_items where purchase_id = p_purchase_id;

  if v_batch_ids is null then
    raise exception 'purchase not found';
  end if;

  select exists (
    select 1
    from purchase_items pi
    join stock_batches sb on sb.id = pi.stock_batch_id
    where pi.purchase_id = p_purchase_id
      and sb.quantity_remaining < pi.base_quantity
  ) into v_consumed;

  if v_consumed then
    raise exception 'cannot delete: stock from this purchase has already been used';
  end if;

  select cheque_id into v_cheque_id from purchases where id = p_purchase_id;

  if v_cheque_id is not null then
    delete from supplier_payments where cheque_id = v_cheque_id;
  end if;

  delete from purchases where id = p_purchase_id;
  delete from stock_batches where id = any(v_batch_ids);

  if v_cheque_id is not null then
    delete from cheques where id = v_cheque_id;
  end if;

  return v_pin;
end;
$$;

create function delete_stock_out(p_stock_out_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete stock-out entries' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  if not exists (select 1 from stock_out where id = p_stock_out_id) then
    raise exception 'stock-out entry not found';
  end if;

  perform stock_out_reverse(p_stock_out_id);
  delete from stock_out where id = p_stock_out_id;

  return v_pin;
end;
$$;

create function delete_opening_stock(p_entry_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_entry opening_stock_entries%rowtype;
  v_batch stock_batches%rowtype;
begin
  if not is_owner() then
    raise exception 'only owner can delete opening stock entries' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select * into v_entry from opening_stock_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'opening stock entry not found';
  end if;

  select * into v_batch from stock_batches where id = v_entry.stock_batch_id for update;

  if v_batch.quantity_remaining < v_entry.base_quantity then
    raise exception 'cannot delete: some of this opening stock has already been used elsewhere';
  end if;

  delete from opening_stock_entries where id = p_entry_id;

  -- Only drop the batch row itself if nothing else's audit trail still
  -- points at it; otherwise just take the opening-stock contribution back
  -- out of its running total.
  if exists (select 1 from stock_out_batches where stock_batch_id = v_entry.stock_batch_id)
     or exists (select 1 from stock_adjustments where stock_batch_id = v_entry.stock_batch_id) then
    update stock_batches
    set quantity_remaining = quantity_remaining - v_entry.base_quantity
    where id = v_entry.stock_batch_id;
  else
    delete from stock_batches where id = v_entry.stock_batch_id;
  end if;

  return v_pin;
end;
$$;

create function delete_stock_adjustment(p_adjustment_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_adj stock_adjustments%rowtype;
  v_batch stock_batches%rowtype;
begin
  if not is_owner() then
    raise exception 'only owner can delete stock adjustments' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select * into v_adj from stock_adjustments where id = p_adjustment_id;
  if v_adj.id is null then
    raise exception 'stock adjustment not found';
  end if;

  select * into v_batch from stock_batches where id = v_adj.stock_batch_id for update;

  if (v_batch.quantity_remaining - v_adj.quantity_change) < 0 then
    raise exception 'cannot delete: stock from this adjustment has already been used elsewhere';
  end if;

  update stock_batches
  set quantity_remaining = quantity_remaining - v_adj.quantity_change
  where id = v_adj.stock_batch_id;

  delete from stock_adjustments where id = p_adjustment_id;

  return v_pin;
end;
$$;

create function delete_supplier_payment(p_payment_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_cheque_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can delete supplier payments' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select cheque_id into v_cheque_id from supplier_payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found';
  end if;

  delete from supplier_payments where id = p_payment_id;

  if v_cheque_id is not null then
    delete from cheques where id = v_cheque_id;
  end if;

  return v_pin;
end;
$$;

create function delete_customer_credit(p_credit_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete customer credit' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  delete from customer_credits where id = p_credit_id;

  if not found then
    raise exception 'credit entry not found';
  end if;

  return v_pin;
end;
$$;

create function delete_customer_payment(p_payment_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete customer payments' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  delete from customer_payments where id = p_payment_id;

  if not found then
    raise exception 'payment not found';
  end if;

  return v_pin;
end;
$$;

create function delete_salary_payment(p_payment_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete salary payments' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  delete from salary_payments where id = p_payment_id;

  if not found then
    raise exception 'salary payment not found';
  end if;

  return v_pin;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────
-- create function re-triggers this project's default privileges (which
-- include anon), so revoke from public AND anon explicitly.

revoke all on function check_delete_pin(text) from public;
revoke all on function check_delete_pin(text) from anon;
revoke all on function check_delete_pin(text) from authenticated;

revoke all on function admin_reset_delete_pin(uuid, text) from public;
revoke all on function admin_reset_delete_pin(uuid, text) from anon;
revoke all on function admin_reset_delete_pin(uuid, text) from authenticated;
grant execute on function admin_reset_delete_pin(uuid, text) to service_role;

revoke all on function has_delete_pin() from public;
revoke all on function has_delete_pin() from anon;
grant execute on function has_delete_pin() to authenticated;

revoke all on function set_delete_pin(text, text) from public;
revoke all on function set_delete_pin(text, text) from anon;
grant execute on function set_delete_pin(text, text) to authenticated;

revoke all on function delete_purchase(uuid, text) from public;
revoke all on function delete_purchase(uuid, text) from anon;
grant execute on function delete_purchase(uuid, text) to authenticated;

revoke all on function delete_stock_out(uuid, text) from public;
revoke all on function delete_stock_out(uuid, text) from anon;
grant execute on function delete_stock_out(uuid, text) to authenticated;

revoke all on function delete_opening_stock(uuid, text) from public;
revoke all on function delete_opening_stock(uuid, text) from anon;
grant execute on function delete_opening_stock(uuid, text) to authenticated;

revoke all on function delete_stock_adjustment(uuid, text) from public;
revoke all on function delete_stock_adjustment(uuid, text) from anon;
grant execute on function delete_stock_adjustment(uuid, text) to authenticated;

revoke all on function delete_supplier_payment(uuid, text) from public;
revoke all on function delete_supplier_payment(uuid, text) from anon;
grant execute on function delete_supplier_payment(uuid, text) to authenticated;

revoke all on function delete_customer_credit(uuid, text) from public;
revoke all on function delete_customer_credit(uuid, text) from anon;
grant execute on function delete_customer_credit(uuid, text) to authenticated;

revoke all on function delete_customer_payment(uuid, text) from public;
revoke all on function delete_customer_payment(uuid, text) from anon;
grant execute on function delete_customer_payment(uuid, text) to authenticated;

revoke all on function delete_salary_payment(uuid, text) from public;
revoke all on function delete_salary_payment(uuid, text) from anon;
grant execute on function delete_salary_payment(uuid, text) to authenticated;

-- stock_out_reverse is an internal helper of delete_stock_out /
-- update_stock_out (no is_owner check of its own). It was directly callable
-- through the API, which would have been a PIN-less way to undo a stock-out's
-- batch deductions -- make it internal-only. The DEFINER functions that use
-- it run as the function owner and are unaffected.
revoke all on function stock_out_reverse(uuid) from public;
revoke all on function stock_out_reverse(uuid) from anon;
revoke all on function stock_out_reverse(uuid) from authenticated;
