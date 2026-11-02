"""Keep search notifications scoped, deduplicated and honest about receipts."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('indexnow', Path(__file__).resolve().parents[1] / 'scripts/indexnow.py')
indexnow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(indexnow)


class Response:
    def __init__(self, status, body=b''):
        self.status, self.body = status, body
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return self.body[:limit]


class IndexNowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        for name, value in [('OUT', root), ('CONFIG', root / 'config.json'), ('STATE', root / 'state.json')]:
            patcher = patch.object(indexnow, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.token = 'a' * 32
        indexnow.CONFIG.write_text(json.dumps({'host': indexnow.HOST, 'key': self.token}))
        (root / 'index.html').write_text('<h1>Relay</h1>')
        (root / 'sitemap.xml').write_text(f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{indexnow.BASE}/</loc></url></urlset>')

    def run_command(self, *args):
        output = io.StringIO()
        with patch('sys.argv', ['indexnow.py', *args]), redirect_stdout(output):
            indexnow.main()
        return output.getvalue()

    def test_dry_run_never_contacts_engine_or_changes_state(self):
        with patch.object(indexnow, 'urlopen') as network:
            self.assertIn('1 changed URLs', self.run_command('--dry-run'))
            network.assert_not_called()
        self.assertFalse(indexnow.STATE.exists())

    def test_pending_receipt_is_recorded_without_claiming_indexing_and_deduplicated(self):
        with patch.object(indexnow, 'urlopen', side_effect=[Response(200, self.token.encode()), Response(202)]) as network:
            output = self.run_command()
            self.assertIn('ownership verification pending', output)
            payload = json.loads(network.call_args_list[1].args[0].data)
            self.assertEqual(payload['urlList'], [indexnow.BASE + '/'])
        self.assertEqual(json.loads(indexnow.STATE.read_text())['last_http_status'], 202)
        with patch.object(indexnow, 'urlopen') as network:
            self.assertIn('No changed', self.run_command())
            network.assert_not_called()

    def test_failed_submission_does_not_mark_pages_notified(self):
        error = HTTPError(indexnow.ENDPOINT, 429, 'Too many requests', {}, None)
        with patch.object(indexnow, 'urlopen', side_effect=[Response(200, self.token.encode()), error]):
            with self.assertRaises(HTTPError):
                self.run_command()
        self.assertFalse(indexnow.STATE.exists())

    def test_foreign_sitemap_url_is_rejected_before_network(self):
        sitemap = indexnow.OUT / 'sitemap.xml'
        sitemap.write_text(sitemap.read_text().replace(indexnow.BASE, 'https://example.com'))
        with patch.object(indexnow, 'urlopen') as network:
            with self.assertRaises(AssertionError):
                self.run_command()
            network.assert_not_called()


if __name__ == '__main__':
    unittest.main()
