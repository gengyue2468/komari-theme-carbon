import type { CarbonIconType } from "@carbon/icons-react";
import { Chip, ContainerSoftware, Terminal, VirtualMachine } from "@carbon/icons-react";

export type IconRef =
  | { kind: "carbon"; Icon: CarbonIconType }
  | { kind: "iconify"; id: string };

/* ── CPU vendor ── */

export function getArchIcon(arch: string, cpuName = ""): { icon: IconRef; label: string } {
  const a = arch.trim().toLowerCase();
  const cpu = cpuName.trim().toLowerCase();
  const label = [cpuName.trim(), arch.trim()].filter(Boolean).join(" · ") || "CPU";

  // Prefer simple-icons set for consistent stroke/fill weight
  if (
    cpu.includes("amd") ||
    cpu.includes("epyc") ||
    cpu.includes("ryzen") ||
    cpu.includes("threadripper") ||
    cpu.includes("athlon")
  )
    return { icon: { kind: "iconify", id: "bi:amd" }, label };
  if (
    cpu.includes("intel") ||
    cpu.includes("xeon") ||
    cpu.includes("core i") ||
    cpu.includes("core(tm)") ||
    cpu.includes("celeron") ||
    cpu.includes("pentium")
  )
    return { icon: { kind: "iconify", id: "simple-icons:intel" }, label };
  if (
    cpu.includes("arm") ||
    cpu.includes("cortex") ||
    cpu.includes("neoverse") ||
    cpu.includes("apple m") ||
    a.includes("arm") ||
    a.includes("aarch")
  )
    return { icon: { kind: "iconify", id: "simple-icons:arm" }, label };
  if (a.includes("amd64") || a.includes("x86_64") || a.includes("x64"))
    return { icon: { kind: "iconify", id: "bi:amd" }, label };
  if (a.includes("i386") || a.includes("i686") || a === "x86")
    return { icon: { kind: "iconify", id: "simple-icons:intel" }, label };

  return { icon: { kind: "carbon", Icon: Chip }, label };
}

/* ── OS ── */

const OS_ICONS: Array<{ kw: string[]; icon: string; label: string }> = [
  { kw: ["ubuntu", "kubuntu"], icon: "simple-icons:ubuntu", label: "Ubuntu" },
  { kw: ["debian"], icon: "simple-icons:debian", label: "Debian" },
  { kw: ["alma"], icon: "simple-icons:almalinux", label: "AlmaLinux" },
  { kw: ["rocky"], icon: "simple-icons:rockylinux", label: "Rocky Linux" },
  { kw: ["centos"], icon: "simple-icons:centos", label: "CentOS" },
  { kw: ["fedora"], icon: "simple-icons:fedora", label: "Fedora" },
  { kw: ["rhel", "red hat", "redhat"], icon: "simple-icons:redhat", label: "Red Hat" },
  { kw: ["opensuse", "suse"], icon: "simple-icons:opensuse", label: "openSUSE" },
  { kw: ["arch"], icon: "simple-icons:archlinux", label: "Arch Linux" },
  { kw: ["alpine"], icon: "simple-icons:alpinelinux", label: "Alpine" },
  { kw: ["mint"], icon: "simple-icons:linuxmint", label: "Linux Mint" },
  { kw: ["kali"], icon: "simple-icons:kalilinux", label: "Kali" },
  { kw: ["pop!_os", "popos", "pop os"], icon: "simple-icons:popos", label: "Pop!_OS" },
  { kw: ["openwrt", "immortalwrt"], icon: "simple-icons:openwrt", label: "OpenWrt" },
  { kw: ["freebsd", "openbsd", "netbsd", "bsd"], icon: "simple-icons:freebsd", label: "FreeBSD" },
  { kw: ["macos", "darwin", "os x"], icon: "simple-icons:apple", label: "macOS" },
  { kw: ["linux"], icon: "simple-icons:linux", label: "Linux" },
];

export function getOsIcon(os: string): { icon: IconRef; label: string } {
  const s = os.toLowerCase();
  for (const item of OS_ICONS) {
    if (item.kw.some((k) => s.includes(k))) {
      return { icon: { kind: "iconify", id: item.icon }, label: item.label };
    }
  }
  return { icon: { kind: "carbon", Icon: Terminal }, label: osShort(os) };
}

/* ── Virtualization ── */

export function getVirtIcon(virt: string): { icon: IconRef; label: string } {
  const raw = virt.trim();
  const s = raw.toLowerCase();

  if (!s || s === "none" || s === "physical" || s === "baremetal" || s === "bare-metal")
    return { icon: { kind: "carbon", Icon: Chip }, label: raw || "Physical" };

  // Container-based
  if (s.includes("docker") || s.includes("podman") || s.includes("lxc") || s.includes("lxd") || s.includes("linux container"))
    return { icon: { kind: "carbon", Icon: ContainerSoftware }, label: s.includes("docker") ? "Docker" : s.includes("podman") ? "Podman" : "LXC" };

  // VM-based
  if (s.includes("proxmox") || s.includes("qemu") || s.includes("kvm") || s.includes("vmware") || s.includes("esxi") || s.includes("virtualbox") || s.includes("vbox") || s.includes("xen") || s.includes("openvz") || s.includes("microsoft") || s.includes("hyperv") || s.includes("hyper-v"))
    return {
      icon: { kind: "carbon", Icon: VirtualMachine },
      label: s.includes("kvm") ? "KVM" : s.includes("qemu") ? "QEMU" : s.includes("vmware") ? "VMware" : s.includes("virtualbox") ? "VirtualBox" : s.includes("xen") ? "Xen" : s.includes("openvz") ? "OpenVZ" : s.includes("hyperv") ? "Hyper-V" : "Proxmox",
    };

  return { icon: { kind: "carbon", Icon: Chip }, label: raw || "virt" };
}

function osShort(os: string): string {
  return (os.split(/[\s(/]/)[0] ?? os).slice(0, 16);
}
