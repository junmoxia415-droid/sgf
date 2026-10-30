// Solo para el usuario temporal del laboratorio de Windows; no es código de producción.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class PermisoLoteLaboratorio {
  [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes {
    public uint Length; public IntPtr RootDirectory; public IntPtr ObjectName;
    public uint Attributes; public IntPtr SecurityDescriptor; public IntPtr SecurityQualityOfService;
  }
  [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
  [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr system, ref ObjectAttributes attributes, uint access, out IntPtr handle);
  [DllImport("advapi32.dll")] static extern uint LsaAddAccountRights(IntPtr handle, IntPtr sid, UnicodeString[] rights, uint count);
  [DllImport("advapi32.dll")] static extern uint LsaRemoveAccountRights(IntPtr handle, IntPtr sid, bool allRights, UnicodeString[] rights, uint count);
  [DllImport("advapi32.dll")] static extern uint LsaNtStatusToWinError(uint status);
  [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr handle);
  public static void Modificar(string sidTexto, bool agregar) {
    var sid = new SecurityIdentifier(sidTexto); var bytes = new byte[sid.BinaryLength]; sid.GetBinaryForm(bytes,0);
    IntPtr sidPtr=Marshal.AllocHGlobal(bytes.Length), texto=Marshal.StringToHGlobalUni("SeBatchLogonRight"), policy=IntPtr.Zero;
    try {
      Marshal.Copy(bytes,0,sidPtr,bytes.Length);
      var oa=new ObjectAttributes(); oa.Length=(uint)Marshal.SizeOf(typeof(ObjectAttributes));
      uint status=LsaOpenPolicy(IntPtr.Zero,ref oa,0x00000810,out policy);
      if(status!=0)throw new Win32Exception((int)LsaNtStatusToWinError(status));
      var rights=new[]{new UnicodeString{Length=(ushort)("SeBatchLogonRight".Length*2),MaximumLength=(ushort)(("SeBatchLogonRight".Length+1)*2),Buffer=texto}};
      status=agregar?LsaAddAccountRights(policy,sidPtr,rights,1):LsaRemoveAccountRights(policy,sidPtr,false,rights,1);
      if(status!=0)throw new Win32Exception((int)LsaNtStatusToWinError(status));
    } finally {if(policy!=IntPtr.Zero)LsaClose(policy);Marshal.FreeHGlobal(texto);Marshal.FreeHGlobal(sidPtr);}
  }
}
