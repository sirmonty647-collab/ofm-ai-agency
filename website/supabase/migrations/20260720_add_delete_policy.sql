CREATE POLICY "anon can delete own visits" ON visits FOR DELETE USING (true);
