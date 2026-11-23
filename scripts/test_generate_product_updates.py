import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.generate_product_updates import collect_updates


class ProductUpdateGenerationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-b", "main", str(self.root)], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(self.root), "config", "user.name", "Test"], check=True)

    def tearDown(self):
        self.temp.cleanup()

    def commit(self, path: str, subject: str, date: str):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("test\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.root), "add", path], check=True)
        env = os.environ | {"GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date}
        subprocess.run(["git", "-C", str(self.root), "commit", "-m", subject], check=True, env=env, capture_output=True)

    def test_records_public_feat_fix_and_perf_but_skips_admin_and_non_user_changes(self):
        self.commit("README.md", "docs: docs only", "2026-11-20T10:00:00+09:00")
        self.commit("frontend/src/pages/DiagnosticsPage.tsx", "feat(diag): 진단 필터 추가", "2026-11-21T10:00:00+09:00")
        self.commit("frontend/src/pages/AdminPage.tsx", "feat(admin): 사용자 관리 개선", "2026-11-22T10:00:00+09:00")
        self.commit("frontend/src/panels/OfficeDashboard.tsx", "fix(dashboard): 대시보드 표시 수정", "2026-11-23T10:00:00+09:00")

        updates = collect_updates(self.root)

        self.assertEqual(updates, [
            {"date": "2026-11-23", "items": ["대시보드 · 대시보드 표시 수정"]},
            {"date": "2026-11-21", "items": ["진단 · 진단 필터 추가"]},
        ])


if __name__ == "__main__":
    unittest.main()
