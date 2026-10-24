import datetime as dt
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('weekly_feedback',Path(__file__).parents[1]/'scripts'/'weekly_feedback.py')
report=importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)

class WeeklyReportTests(unittest.TestCase):
    def test_previous_calendar_week_and_dst(self):
        for instant,hours in [('2026-03-30T07:00:00+00:00',167),('2026-10-26T08:00:00+00:00',169)]:
            period,begin,end,start,finish=report.week_window(dt.datetime.fromisoformat(instant))
            self.assertEqual(start.weekday(),0)
            self.assertEqual(finish.weekday(),0)
            self.assertEqual(start.hour,0)
            self.assertEqual((dt.datetime.fromisoformat(end.replace('Z','+00:00'))-dt.datetime.fromisoformat(begin.replace('Z','+00:00'))).total_seconds()/3600,hours)
            self.assertEqual(period,start.date().isoformat())

    def test_sunday_still_selects_the_last_completed_week(self):
        period,_,_,_,_=report.week_window(dt.datetime.fromisoformat('2026-10-25T12:00:00+00:00'))
        self.assertEqual(period,'2026-10-12')

    def test_pairing_requires_unique_recent_private_sender(self):
        code='private-report-code-12345';now=1800000000
        def item(chat,date=now,text='/edofa-report '+code):
            return {'message':{'date':date,'text':text,'chat':{'type':'private','id':chat},'from':{'id':chat,'is_bot':False}}}
        self.assertEqual(report.matching_chat([item(42)],code,now),'42')
        for items in [[item(42,date=now-1801)],[item(42),item(43)],[item(42,text='/start')]]:
            with self.assertRaises(RuntimeError):report.matching_chat(items,code,now)

    def test_report_keeps_full_content_without_private_network_fields(self):
        _,_,_,start,end=report.week_window(dt.datetime.fromisoformat('2026-10-26T08:00:00+00:00'))
        text='Messaggio lungo '+('testo '*400)
        output=report.report_text([{'id':'id-1','created_at':'2026-10-23T08:00:00Z','title':'Una proposta','kind':'Suggerimento','message':text,'network_key':'PRIVATE-NETWORK'}],start,end)
        self.assertIn(text,output)
        self.assertNotIn('PRIVATE-NETWORK',output)

    def test_pairing_accepts_plain_code_and_both_command_spellings(self):
        code='private-report-code-12345';now=1800000000
        for text in [code, ' '+code+'\n','/edofa_report '+code,'/edofa-report '+code,'/edofa_report@MyBot '+code]:
            update={'message':{'date':now,'text':text,'chat':{'type':'private','id':42},'from':{'id':42,'is_bot':False}}}
            self.assertEqual(report.matching_chat([update],code,now),'42')

    def test_empty_update_diagnostic_exposes_counts_only(self):
        with self.assertRaisesRegex(RuntimeError,'Aggiornamenti letti: 0; messaggi privati recenti: 0'):
            report.matching_chat([],'private-report-code-12345',1800000000)

    def test_pending_updates_are_paginated(self):
        pages=[[{'update_id':i} for i in range(100)],[{'update_id':100}]]
        with patch.object(report,'telegram',side_effect=pages) as telegram:
            self.assertEqual(len(report.read_pairing_updates('private')),101)
            self.assertEqual(telegram.call_args_list[1].args[2]['offset'],100)

    def test_duplicate_completed_report_never_calls_telegram(self):
        def worker(token,action,payload=None):
            return {'status':{'enabled':True,'chat_id':'42'},'list':{'rows':[]},'claim':{'claimed':False,'state':'inviato'}}[action]
        with patch.dict(report.os.environ,{'TELEGRAM_BOT_TOKEN':'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789','REPORT_MODE':'report'}),patch.object(report,'worker',side_effect=worker),patch.object(report,'telegram') as telegram,patch.object(report,'send_document') as document:
            report.main()
            telegram.assert_not_called();document.assert_not_called()

    def test_failed_connection_test_never_enables_weekly_report(self):
        with patch.dict(report.os.environ,{'TELEGRAM_BOT_TOKEN':'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789','REPORT_MODE':'collega'}),patch.object(report,'telegram',side_effect=RuntimeError('connection failed')),patch.object(report,'worker') as worker:
            with self.assertRaises(RuntimeError):report.main()
            worker.assert_not_called()

if __name__=='__main__':unittest.main()
