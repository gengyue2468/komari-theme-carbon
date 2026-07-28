import type { CarbonIconType } from "@carbon/icons-react";
import { Chip, Terminal } from "@carbon/icons-react";

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
    return { icon: { kind: "iconify", id: "simple-icons:amd" }, label };
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
    return { icon: { kind: "iconify", id: "simple-icons:amd" }, label };
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
  if (s.includes("docker"))
    return { icon: { kind: "iconify", id: "simple-icons:docker" }, label: "Docker" };
  if (s.includes("podman"))
    return { icon: { kind: "iconify", id: "simple-icons:podman" }, label: "Podman" };
  if (s.includes("lxc") || s.includes("lxd") || s.includes("linux container"))
    return { icon: { kind: "iconify", id: "simple-icons:linuxcontainers" }, label: "LXC" };
  if (s.includes("proxmox"))
    return { icon: { kind: "iconify", id: "simple-icons:proxmox" }, label: "Proxmox" };
  if (s.includes("qemu") || s.includes("kvm"))
    return { icon: { kind: "iconify", id: "simple-icons:qemu" }, label: s.includes("kvm") ? "KVM" : "QEMU" };
  if (s.includes("vmware") || s.includes("esxi"))
    return { icon: { kind: "iconify", id: "simple-icons:vmware" }, label: "VMware" };
  if (s.includes("virtualbox") || s.includes("vbox"))
    return { icon: { kind: "iconify", id: "simple-icons:virtualbox" }, label: "VirtualBox" };
  if (s.includes("xen") || s.includes("openvz"))
    return { icon: { kind: "iconify", id: "simple-icons:qemu" }, label: s.includes("xen") ? "Xen" : "OpenVZ" };

  return { icon: { kind: "carbon", Icon: Chip }, label: raw || "virt" };
}

function osShort(os: string): string {
  return (os.split(/[\s(/]/)[0] ?? os).slice(0, 16);
}
