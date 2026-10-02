import type {Chapter,ChapterSummary,TimeRange} from './editor-model';

export function chapterRange(chapter:Chapter,chapters:Chapter[],duration:number):TimeRange|null {
 if(chapter.start===null)return null;
 const start=chapter.start;
 const next=chapters.filter(c=>c.start!==null&&c.start>start&&(c.kind==='direct'||c.kind==='manual')).reduce((end,c)=>Math.min(end,c.start!),duration);
 const end=chapter.end!==null&&Number.isFinite(chapter.end)&&chapter.end>start?Math.min(chapter.end,next):next;
 return end>start?{start,end}:null;
}
export function validSummary(summary:unknown,duration=Infinity):summary is ChapterSummary {
 const s=summary as ChapterSummary|undefined;
 return !!s&&typeof s.flow==='string'&&!!s.flow.trim()&&s.flow.length<=800&&!/[\r\n]/.test(s.flow)&&Array.isArray(s.insights)&&s.insights.length>=2&&s.insights.length<=3&&s.insights.every(text=>typeof text==='string'&&!!text.trim()&&text.length<=400&&!/[\r\n]/.test(text))&&(!s.range||(Number.isFinite(s.range.start)&&Number.isFinite(s.range.end)&&s.range.start>=0&&s.range.end>s.range.start&&s.range.end<=duration+.001));
}
export function currentSummary(chapter:Chapter,range:TimeRange|null):ChapterSummary|null {
 const summary=chapter.summary;
 return validSummary(summary)&&(!summary.range||(range&&summary.range.start===range.start&&summary.range.end===range.end))?summary:null;
}
