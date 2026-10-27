import {test,expect,vi} from 'vitest';
import {VoiceStudioGateway} from '@/lib/voice/voicestudio';
test('Voice Studio uses documented multipart generation and private Ogg retrieval',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('RIFFbinary',{headers:{'Content-Type':'audio/wav','X-Audio-Id':'1234abcd'}})).mockResolvedValueOnce(new Response('OggSsampleOpusHead',{headers:{'Content-Type':'audio/ogg'}}));
 const api=new VoiceStudioGateway({baseUrl:'https://voice.example.test',apiKey:'secret',engine:'configured-engine'},fetcher);
 const audio=await api.generate({profileId:'abcd1234',text:'Olá',language:'Portuguese'});
 expect(audio.type).toBe('audio/ogg');
 expect(fetcher.mock.calls[0][0]).toBe('https://voice.example.test/generate');
 const options=fetcher.mock.calls[0][1] as RequestInit;
 expect(options.body).toBeInstanceOf(FormData);
 expect((options.body as FormData).get('profile_id')).toBe('abcd1234');
 expect(options.headers).toMatchObject({Authorization:'Bearer secret'});
 expect(options.redirect).toBe('error');
 expect(fetcher.mock.calls[1][0]).toBe('https://voice.example.test/audio/1234abcd.ogg');
});
test('generation failures or partial speech never trigger media fetch or paid calls',async()=>{
 for(const response of [new Response('secret',{status:401}),new Response('{}',{headers:{'Content-Type':'application/json'}}),new Response('RIFFx',{headers:{'Content-Type':'audio/wav','X-Audio-Id':'../other'}}),new Response('RIFFx',{headers:{'Content-Type':'audio/wav','X-Audio-Id':'1234abcd','X-OmniVoice-Dropped-Chunks':'1'}})]){
  const fetcher=vi.fn(async()=>response);
  const api=new VoiceStudioGateway({baseUrl:'https://voice.example.test',apiKey:'secret',engine:'configured-engine'},fetcher);
  await expect(api.generate({profileId:'abcd1234',text:'Olá'})).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
 }
});
test('no arbitrary provider URL, profile path, empty text or automatic telephony endpoint',async()=>{
 expect(()=>new VoiceStudioGateway({baseUrl:'http://voice.example.test',apiKey:'x',engine:'engine'})).toThrow();
 const fetcher=vi.fn();const api=new VoiceStudioGateway({baseUrl:'https://voice.example.test',apiKey:'secret',engine:'engine'},fetcher);
 await expect(api.generate({profileId:'../id',text:'Olá'})).rejects.toThrow();
 await expect(api.generate({profileId:'abcd1234',text:' '})).rejects.toThrow();
 expect(fetcher).not.toHaveBeenCalled();
});
test('existing domain prefix is preserved without exposing the studio dashboard',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('RIFFaudio',{headers:{'Content-Type':'audio/wav','X-Audio-Id':'1234abcd'}})).mockResolvedValueOnce(new Response('OggSOpusHead',{headers:{'Content-Type':'audio/ogg'}}));
 const api=new VoiceStudioGateway({baseUrl:'https://crm.example.test/prospectra-voice/',apiKey:'x',engine:'engine'},fetcher);
 await api.generate({profileId:'abcd1234',text:'Olá'});
 expect(fetcher.mock.calls[0][0]).toBe('https://crm.example.test/prospectra-voice/generate');
 expect(fetcher.mock.calls[1][0]).toBe('https://crm.example.test/prospectra-voice/audio/1234abcd.ogg');
});
