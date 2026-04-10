-- 출퇴근 허용 IP 설정
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allowed_ip text;

COMMENT ON COLUMN profiles.allowed_ip IS '출퇴근 허용 IP 주소. NULL이면 제한 없음.';
