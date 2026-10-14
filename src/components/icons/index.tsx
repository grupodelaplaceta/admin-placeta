import type { SVGProps } from 'react';
import {
  LayoutDashboard, Inbox, Workflow, Folder, Users, Building2, Cog, ScrollText,
  Bell, Scale, Settings, Wallet, Receipt, Home, Search, LogOut, Menu, X, Check,
  Lock, AlertTriangle, ShieldCheck, FileText, KeyRound, Box, Handshake, Vote, User,
  Plus, Clock, PenLine, Send, Eye, CalendarDays, Download, ChevronRight, Pencil,
  Trash2, Filter, ArrowRight, Sparkles, Banknote, Gavel, FileCheck2, ClipboardList,
  Stamp, Landmark, CircleCheck, CircleX, Info, BadgeCheck, Loader2, ScanLine,
  RefreshCw, CreditCard, LockOpen, Trophy, GraduationCap,
} from 'lucide-react';

export const ICONS = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  workflow: Workflow,
  folder: Folder,
  users: Users,
  building: Building2,
  cog: Cog,
  scroll: ScrollText,
  bell: Bell,
  scale: Scale,
  settings: Settings,
  wallet: Wallet,
  receipt: Receipt,
  home: Home,
  search: Search,
  logout: LogOut,
  menu: Menu,
  x: X,
  check: Check,
  lock: Lock,
  alert: AlertTriangle,
  shield: ShieldCheck,
  file: FileText,
  key: KeyRound,
  box: Box,
  handshake: Handshake,
  vote: Vote,
  user: User,
  plus: Plus,
  clock: Clock,
  pen: PenLine,
  send: Send,
  eye: Eye,
  calendar: CalendarDays,
  download: Download,
  chevronRight: ChevronRight,
  edit: Pencil,
  trash: Trash2,
  filter: Filter,
  arrowRight: ArrowRight,
  sparkles: Sparkles,
  banknote: Banknote,
  gavel: Gavel,
  fileCheck: FileCheck2,
  clipboard: ClipboardList,
  stamp: Stamp,
  landmark: Landmark,
  circleCheck: CircleCheck,
  circleX: CircleX,
  info: Info,
  badgeCheck: BadgeCheck,
  loader: Loader2,
  scan: ScanLine,
  refresh: RefreshCw,
  creditCard: CreditCard,
  unlock: LockOpen,
  trophy: Trophy,
  graduationCap: GraduationCap,
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  const Cmp = ICONS[name] ?? CircleCheck;
  return <Cmp size={size} strokeWidth={1.9} aria-hidden="true" {...rest} />;
}

/** Mapa de claves semánticas (usado por datos que traen `icono` como string). */
export const ICONO_SEMANTICO: Record<string, IconName> = {
  identidad: 'user',
  banco: 'wallet',
  fiscalidad: 'receipt',
  patrimonio: 'home',
  expedientes: 'folder',
  documentos: 'file',
  firmas: 'stamp',
  notificaciones: 'bell',
};
