-- Keep the notification tables and functions for a possible future return,
-- but stop new order changes from being queued while notifications are paused.
alter table public.orders disable trigger queue_order_push_notification;
