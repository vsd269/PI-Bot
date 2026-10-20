// Plugin-owned Windows audio input. No transcript, API key or audio file is written to disk.
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
public sealed class PiBotMicrophone : IDisposable {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Caps { public ushort mid,pid; public uint version; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string name; public uint formats; public ushort channels,reserved; }
  [StructLayout(LayoutKind.Sequential, Pack=2)]
  struct Format { public ushort tag,channels; public uint rate,bytes; public ushort align,bits,extra; }
  [StructLayout(LayoutKind.Sequential)]
  struct Header { public IntPtr data; public uint length,recorded; public UIntPtr user; public uint flags,loops; public IntPtr next; public UIntPtr reserved; }
  [DllImport("winmm.dll")] static extern uint waveInGetNumDevs();
  [DllImport("winmm.dll",CharSet=CharSet.Unicode)] static extern uint waveInGetDevCapsW(UIntPtr device,out Caps caps,uint size);
  [DllImport("winmm.dll")] static extern uint waveInOpen(out IntPtr handle,uint device,ref Format format,IntPtr callback,UIntPtr instance,uint flags);
  [DllImport("winmm.dll")] static extern uint waveInPrepareHeader(IntPtr handle,IntPtr header,uint size);
  [DllImport("winmm.dll")] static extern uint waveInUnprepareHeader(IntPtr handle,IntPtr header,uint size);
  [DllImport("winmm.dll")] static extern uint waveInAddBuffer(IntPtr handle,IntPtr header,uint size);
  [DllImport("winmm.dll")] static extern uint waveInStart(IntPtr handle);
  [DllImport("winmm.dll")] static extern uint waveInReset(IntPtr handle);
  [DllImport("winmm.dll")] static extern uint waveInClose(IntPtr handle);
  static readonly object output=new object();
  readonly object gate=new object(),lifecycle=new object(); readonly MemoryStream audio=new MemoryStream();
  readonly IntPtr[] headers=new IntPtr[4],buffers=new IntPtr[4];
  readonly uint size=(uint)Marshal.SizeOf(typeof(Header));
  readonly AutoResetEvent dataReady=new AutoResetEvent(false); Thread worker; IntPtr handle; Timer timer; volatile bool stopped,disposed; double level; int ticks,finished,nextBuffer; readonly string recordId;
  public static void Emit(string json){lock(output)Console.WriteLine(json);}
  public static string[] Devices(){int count=(int)waveInGetNumDevs();string[] names=new string[count];for(int i=0;i<count;i++){Caps caps;uint result=waveInGetDevCapsW((UIntPtr)(uint)i,out caps,(uint)Marshal.SizeOf(typeof(Caps)));names[i]=result==0?caps.name:"";}return names;}
  static void Check(uint result){if(result!=0)throw new Exception("Windows 麦克风无法开启（"+result+"）。请检查系统录音权限、设备连接，或更换输入设备。");}
  readonly bool streaming;
  public PiBotMicrophone(int device,string id):this(device,id,false){}
  public PiBotMicrophone(int device,string id,bool stream){
    streaming=stream;
    recordId=id;
    try {
      Format format=new Format{tag=1,channels=1,rate=16000,bytes=32000,align=2,bits=16,extra=0};
      Check(waveInOpen(out handle,unchecked((uint)device),ref format,dataReady.SafeWaitHandle.DangerousGetHandle(),UIntPtr.Zero,0x50000));
      for(int i=0;i<4;i++){buffers[i]=Marshal.AllocHGlobal(3200);headers[i]=Marshal.AllocHGlobal((int)size);Marshal.StructureToPtr(new Header{data=buffers[i],length=3200},headers[i],false);Check(waveInPrepareHeader(handle,headers[i],size));Check(waveInAddBuffer(handle,headers[i],size));}
      worker=new Thread(ReadLoop);worker.IsBackground=true;worker.Start();
      Check(waveInStart(handle));
      timer=new Timer(delegate { if(stopped)return; Emit("{\"type\":\"level\",\"id\":\""+recordId+"\",\"level\":"+Math.Min(1,level).ToString("0.000",System.Globalization.CultureInfo.InvariantCulture)+"}");if(Interlocked.Increment(ref ticks)>=600)Finish(); },null,100,100);
    } catch { Dispose();throw; }
  }
  void ReadLoop(){while(!stopped){dataReady.WaitOne(100);lock(gate){if(!stopped)Consume(true);}}}
  // CALLBACK_EVENT keeps all wave API calls off the native driver's callback
  // thread. Reset returns the last partial buffer before we build the WAV.
  void Consume(bool requeue){
    for(int n=0;n<headers.Length;n++){
      int b=nextBuffer;if(headers[b]==IntPtr.Zero)break;Header header=(Header)Marshal.PtrToStructure(headers[b],typeof(Header));if((header.flags&1)==0)break;nextBuffer=(b+1)%headers.Length;
      int length=(int)Math.Min(header.recorded,header.length);length-=length%2;
      if(length>0){byte[] bytes=new byte[length];Marshal.Copy(header.data,bytes,0,length);if(streaming)Emit("{\"type\":\"pcm\",\"id\":\""+recordId+"\",\"audio\":\""+Convert.ToBase64String(bytes)+"\"}");else{int left=(int)Math.Max(0,1920000-audio.Length);audio.Write(bytes,0,Math.Min(left,length));}double energy=0;for(int i=0;i<length;i+=2){double value=(short)(bytes[i]|bytes[i+1]<<8)/32768.0;energy+=value*value;}level=Math.Min(1,Math.Sqrt(energy/(length/2))*5);}
      header.recorded=0;Marshal.StructureToPtr(header,headers[b],false);if(requeue)waveInAddBuffer(handle,headers[b],size);
    }
  }
  void Stop(){lock(gate){if(stopped)return;stopped=true;}if(timer!=null)timer.Dispose();if(handle!=IntPtr.Zero)waveInReset(handle);dataReady.Set();if(worker!=null&&Thread.CurrentThread!=worker)worker.Join();lock(gate){Consume(false);}}
  public void Finish(){lock(lifecycle){if(disposed||Interlocked.Exchange(ref finished,1)!=0)return;Stop();byte[] pcm;lock(gate){pcm=audio.ToArray();audio.SetLength(0);}Dispose();using(MemoryStream wav=new MemoryStream()){using(BinaryWriter writer=new BinaryWriter(wav,Encoding.ASCII,true)){writer.Write(Encoding.ASCII.GetBytes("RIFF"));writer.Write(36+pcm.Length);writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));writer.Write(16);writer.Write((ushort)1);writer.Write((ushort)1);writer.Write(16000);writer.Write(32000);writer.Write((ushort)2);writer.Write((ushort)16);writer.Write(Encoding.ASCII.GetBytes("data"));writer.Write(pcm.Length);writer.Write(pcm);}Emit("{\"type\":\"audio\",\"id\":\""+recordId+"\",\"audio\":\""+Convert.ToBase64String(wav.ToArray())+"\"}");}}}
  public void Dispose(){lock(lifecycle){if(disposed)return;Stop();lock(gate){disposed=true;if(handle!=IntPtr.Zero){for(int i=0;i<4;i++){if(headers[i]!=IntPtr.Zero)waveInUnprepareHeader(handle,headers[i],size);}waveInClose(handle);handle=IntPtr.Zero;}for(int i=0;i<4;i++){if(headers[i]!=IntPtr.Zero){Marshal.FreeHGlobal(headers[i]);headers[i]=IntPtr.Zero;}if(buffers[i]!=IntPtr.Zero){Marshal.FreeHGlobal(buffers[i]);buffers[i]=IntPtr.Zero;}}audio.SetLength(0);dataReady.Dispose();}}}
}
