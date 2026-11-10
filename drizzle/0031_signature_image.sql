CREATE TABLE IF NOT EXISTS user_signature_images (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  data text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
