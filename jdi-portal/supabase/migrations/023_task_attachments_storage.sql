-- task-attachments 스토리지 버킷 및 RLS 정책

INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated can view task attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'task-attachments');
CREATE POLICY "Authenticated can upload task attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'task-attachments');
CREATE POLICY "Authenticated can delete task attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'task-attachments');
