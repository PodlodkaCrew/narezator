import copy
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from exporter import cut_report_markdown, removed_ranges, render_plan, write_sidecars

class LocalServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.root=Path(cls.temp.name)
        server.ROOT=cls.root;server.DATA_DIR=cls.root/'edits';server.EXPORT_DIR=cls.root/'exports';server.PROJECT_FILE=server.DATA_DIR/'project.json';server.STATIC=cls.root/'static';server.STATIC.mkdir()
        cls.media=b'0123456789'*100; (cls.root/'video.mp4').write_bytes(cls.media)
        (server.STATIC/'index.html').write_text('<title>Local editor</title>')
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.port=cls.http.server_address[1];cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.temp.cleanup()
    def request(self,method,path,body=None,headers=None):
        con=http.client.HTTPConnection('127.0.0.1',self.port)
        headers=headers or {}
        if body is not None:body=json.dumps(body);headers['Content-Type']='application/json'
        con.request(method,path,body=body,headers=headers);r=con.getresponse();data=r.read();result=(r.status,dict(r.headers),data);con.close();return result
    def test_ranges_and_head(self):
        code,headers,body=self.request('GET','/api/media',headers={'Range':'bytes=12-21'})
        self.assertEqual(code,206);self.assertEqual(body,self.media[12:22]);self.assertEqual(headers['Content-Range'],'bytes 12-21/1000')
        self.assertEqual(self.request('GET','/api/media',headers={'Range':'bytes=-3'})[2],b'789')
        self.assertEqual(self.request('GET','/api/media',headers={'Range':'bytes=1000-'})[0],416)
        code,headers,body=self.request('HEAD','/api/media');self.assertEqual(code,200);self.assertEqual(body,b'');self.assertEqual(headers['Content-Length'],'1000')
    def test_atomic_save_revision_conflict_and_recovery_file(self):
        _,_,raw=self.request('GET','/api/project');loaded=json.loads(raw);p=loaded['project'];base=loaded['revision'];original=copy.deepcopy(p)
        p['events'].append({'id':'test-event','at':'2026-09-14T00:00:00Z','type':'cut','label':'Test edit'})
        p['clips']=p['clips'][1:]
        code,_,raw=self.request('POST','/api/project',{'project':p,'baseRevision':base});self.assertEqual(code,200);self.assertEqual(json.loads(raw)['revision'],base+1)
        self.assertEqual(json.loads((server.DATA_DIR/'recording.edits.previous.json').read_text()),original)
        self.assertEqual(self.request('POST','/api/project',{'project':p,'baseRevision':base})[0],409)
        self.assertIn('test-event',(server.DATA_DIR/'history.jsonl').read_text())
    def test_validation_and_origin(self):
        p=server.initial_project();p['clips'][0]={**p['clips'][0],'start':float('nan')}
        self.assertEqual(self.request('POST','/api/project',{'project':p,'baseRevision':0})[0],400)
        self.assertEqual(self.request('GET','/api/project',headers={'Origin':'https://untrusted.example'})[0],403)
        self.assertEqual(self.request('GET','/../video.mp4')[0],404)
    def test_export_plan_uses_frame_duration_without_reordering_source(self):
        plan=render_plan([{'start':500,'end':501.1,'id':'b','label':'B'},{'start':20,'end':21.2,'id':'a','label':'A'}])
        self.assertEqual([x['start'] for x in plan],[500,20]);self.assertAlmostEqual(plan[1]['outputStart'],1.1);self.assertAlmostEqual(plan[1]['outputEnd'],2.3)
        self.assertAlmostEqual(sum(round(x['renderDuration']*30) for x in plan)/30,2.3)
    def test_cut_report_covers_final_removed_ranges(self):
        clips=[{'start':30,'end':40},{'start':10,'end':20},{'start':18,'end':35},{'start':30,'end':40}]
        self.assertEqual(removed_ranges(clips,60),[(0,10),(40,60)])
        recording={
            'title':'Интервью','source':'video.mp4','duration':60,
            'words':[
                {'text':'Первая','start':1,'end':1.4},{'text':'фраза.','start':2,'end':2.4},
                {'text':'Последняя','start':8,'end':8.5},{'text':'фраза.','start':9,'end':9.5},
            ],
        }
        report=cut_report_markdown(clips,recording)
        self.assertIn('Вырезано фрагментов: 2',report)
        self.assertIn('00:00:00 – Первая фраза.',report)
        self.assertIn('00:00:10 – Последняя фраза.',report)
        self.assertIn('00:00:40 – (нет распознанной речи)',report)
        self.assertIn('00:01:00 – (нет распознанной речи)',report)
    def test_reel_data_is_validated_without_touching_main_clips(self):
        project=server.initial_project();main=copy.deepcopy(project['clips'])
        project['reels']=[{
            'id':'reel-1','title':'Short answer','createdAt':'2026-09-18T20:00:00Z',
            'clips':[{'id':'reel-clip','start':10,'end':20,'label':'Answer'}],
            'events':[{'id':'reel-event','at':'2026-09-18T20:00:00Z','type':'create','label':'Create reel'}],
            'undo':[],'redo':[],
        }]
        validated=server.validate_project(project)
        self.assertEqual(validated['clips'],main)
        self.assertEqual(validated['reels'][0]['clips'][0]['start'],10)
        legacy=server.initial_project();del legacy['reels']
        self.assertEqual(server.validate_project(legacy)['reels'],[])
    def test_reel_export_sidecars_use_only_the_reel_timeline(self):
        project=server.initial_project();project['clips']=[{'id':'reel-clip','start':10,'end':20,'label':'Reel answer'}]
        recording={**server.RECORDING,'title':'Reel 01 · Short answer'}
        plan=render_plan(project['clips'])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder);write_sidecars(path,project,recording,plan)
            edit_list=json.loads((path/'edit-list.json').read_text())
            self.assertEqual(edit_list['title'],'Reel 01 · Short answer')
            self.assertEqual([(clip['start'],clip['end']) for clip in edit_list['clips']],[(10,20)])
            self.assertIn('# Монтажный лист: Reel 01 · Short answer',(path/'cut-report.md').read_text())
            self.assertTrue((path/'transcript.txt').is_file())
            self.assertTrue((path/'subtitles.srt').is_file())
if __name__=='__main__':unittest.main()
