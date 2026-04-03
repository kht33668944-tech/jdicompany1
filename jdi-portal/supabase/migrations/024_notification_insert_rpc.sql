-- Create a SECURITY DEFINER function for safe notification insertion
CREATE OR REPLACE FUNCTION public.insert_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only authenticated users can create notifications
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_metadata);
END;
$$;

-- Batch version
CREATE OR REPLACE FUNCTION public.insert_notifications_batch(
  p_notifications JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (
      (notif->>'user_id')::UUID,
      notif->>'type',
      notif->>'title',
      notif->>'body',
      notif->>'link',
      COALESCE(notif->'metadata', '{}'::JSONB)
    );
  END LOOP;
END;
$$;

-- Now restrict the direct INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;

-- Block direct inserts - only RPC functions can insert (SECURITY DEFINER bypasses RLS)
CREATE POLICY "No direct inserts" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (false);
