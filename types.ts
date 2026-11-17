export type UserRole = 'client' | 'admin';

export type PlanKey = 'semanal' | 'mensal' | 'vitalicio';

export type PaymentStatus =
  | 'aguardando_pagamento'
  | 'aguardando_analise'
  | 'em_analise'
  | 'aprovado'
  | 'recusado'
  | 'cancelado'
  | 'reembolsado'
  | 'expirado';

export type ProofStatus = 'aguardando_analise' | 'em_analise' | 'aprovado' | 'recusado';

export type GroupRequestStatus = 'pendente_whatsapp' | 'aceito_no_grupo' | 'recusado_no_grupo';

export type SupportTicketStatus =
  | 'aberto'
  | 'em_atendimento'
  | 'aguardando_cliente'
  | 'resolvido'
  | 'encerrado';

export type CommunicationEventKey =
  | 'new_signup'
  | 'payment_approved'
  | 'payment_pending'
  | 'vip_unlocked'
  | 'expiring_soon'
  | 'expired'
  | 'renewed';

export interface PlanConfig {
  name: string;
  preco: string;
  amountCents: number;
  duracao: number; // 7, 30, or 0 for vitalicio
  link: string;
  active?: boolean;
  offerBadge?: string;
  description?: string;
}

export interface PublicPlanSummary {
  key: PlanKey;
  name: string;
  preco: string;
  duracao: number;
  active: boolean;
  offerBadge?: string;
  description?: string;
}

export interface SiteAppearanceConfig {
  siteName: string;
  logoText: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  faviconColor: string;
  heroImageUrl: string;
  vipBannerUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  welcomeMessage: string;
  vipTitle: string;
  vipDescription: string;
  paymentText: string;
  approvedMessage: string;
  expiredMessage: string;
  loginButtonLabel: string;
  registerButtonLabel: string;
  vipGroupButtonLabel: string;
  supportTitle: string;
  supportDescription: string;
  supportHours: string;
  footerText: string;
  termsText: string;
  privacyText: string;
  offerBannerText: string;
  showOfferBanner: boolean;
}

export interface SystemControlsConfig {
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  notifyNewClient: boolean;
  notifyNewProof: boolean;
  notifyExpiring: boolean;
}

export interface SiteConfig {
  hero: string;
  whatsapp: string;
  whatsappLabel: string;
  mensagem: string;
  vipGroupInvite?: string;
  plans: Record<PlanKey, PlanConfig>;
  appearance?: SiteAppearanceConfig;
  controls?: SystemControlsConfig;
}

export interface AdminPermissions {
  canManageClients: boolean;
  canManageFinance: boolean;
  canManageSettings: boolean;
  canManageAdmins: boolean;
}

export interface ClientPreferences {
  theme: 'dark' | 'light';
  inAppNotifications: boolean;
  emailUpdates: boolean;
}

export interface UserProfile {
  id: string;
  displayName: string;
  username: string | null;
  email: string;
  phone: string;
  birthDate: string;
  role: UserRole;
  suspended: boolean;
  adminNotes?: string | null;
  lastLoginAt?: string | null;
  permissions?: AdminPermissions;
  preferences?: ClientPreferences;
  createdAt: string;
}

export interface SubscriptionSummary {
  hasVipAccess: boolean;
  statusLabel: string;
  planKey: PlanKey | null;
  planName: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
}

export interface PaymentProof {
  id: string;
  paymentId: string;
  userId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: ProofStatus;
  extractedAmountCents: number | null;
  extractedReference: string | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  customerName?: string;
  customerEmail?: string;
  planKey?: PlanKey;
  amountCents?: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  planKey: PlanKey;
  amountCents: number;
  originalAmountCents?: number | null;
  discountCents?: number;
  couponCode?: string | null;
  activationOrigin?: string | null;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentId: string | null;
  externalReference: string;
  checkoutUrl: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  proofs?: PaymentProof[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface VipGroupRequest {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  planKey: PlanKey;
  status: GroupRequestStatus;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  targetTab: string;
  recordId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UserNotificationRecord {
  id: string;
  userId: string;
  eventKey: CommunicationEventKey | 'support_reply' | 'system';
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface CommunicationTemplate {
  key: CommunicationEventKey;
  label: string;
  description: string;
  enabled: boolean;
  channel: 'in_app' | 'in_app_and_email_ready';
  subject: string;
  bodyTemplate: string;
}

export interface CouponRecord {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed_cents';
  discountValue: number;
  applicablePlans: PlanKey[];
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discountType: 'percent' | 'fixed_cents';
  discountValue: number;
  originalAmountCents: number;
  discountCents: number;
  finalAmountCents: number;
  message: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: UserRole;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  subject: string;
  category: 'pagamento' | 'acesso_vip' | 'conta' | 'outro';
  status: SupportTicketStatus;
  priority: 'normal' | 'alta';
  adminNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  messages: SupportMessage[];
}

export interface MediaAsset {
  id: string;
  title: string;
  category: 'logo' | 'hero' | 'vip_banner' | 'geral';
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DashboardLayoutConfig {
  visibleSections: {
    kpis: boolean;
    charts: boolean;
    planDistribution: boolean;
    statusMatrix: boolean;
    recentActivities: boolean;
    alerts: boolean;
    quickActions: boolean;
  };
  sectionOrder: Array<
    'alerts' | 'quickActions' | 'kpis' | 'charts' | 'planDistribution' | 'statusMatrix' | 'recentActivities'
  >;
}

export interface AdminOverviewData {
  period: string;
  metrics: {
    totalClients: number;
    activeClients: number;
    newClientsCount: number;
    validSubscribers: number;
    conversionRatePercent?: number;
    expiringSubscriptions: number;
    approvedPayments: number;
    pendingPayments: number;
    pendingProofs: number;
    rejectedPayments: number;
    canceledPayments?: number;
    refundedPayments?: number;
    expiredSubscriptions: number;
    openSupportTickets?: number;
    activeCoupons?: number;
    inconsistentOrders?: number;
    securityWarnings?: number;
    totalRevenueCents: number;
    monthRevenueCents: number;
    periodRevenueCents: number;
    weeklyRevenueCents: number;
    monthlyRevenueCents: number;
    lifetimeRevenueCents: number;
    unreadNotifications: number;
  };
  revenueByPlan: Array<{
    planKey: PlanKey;
    label: string;
    count: number;
    activeSubscribers: number;
    revenueCents: number;
  }>;
  statusBreakdown: Array<{
    status: PaymentStatus;
    label: string;
    count: number;
  }>;
  dailyRevenue: Array<{
    date: string;
    revenueCents: number;
    count: number;
  }>;
  dailySignups?: Array<{
    date: string;
    count: number;
  }>;
  recentSignups: Array<{
    id: string;
    displayName: string;
    email: string;
    createdAt: string;
  }>;
  recentSales: Array<{
    id: string;
    customerName: string;
    planKey: PlanKey;
    amountCents: number;
    approvedAt: string;
  }>;
  recentActivities: Array<{
    id: string;
    type: 'signup' | 'payment' | 'proof' | 'audit' | 'support';
    title: string;
    subtitle: string;
    createdAt: string;
  }>;
  alerts: Array<{
    id: string;
    severity: 'warn' | 'info' | 'err';
    text: string;
    targetTab: string;
  }>;
  integrationStatus: {
    supabaseConfigured: boolean;
    mercadoPagoConfigured: boolean;
    webhookSecretConfigured: boolean;
    storageMode: 'supabase' | 'sqlite_local';
  };
}

export interface AdminCustomerRow extends UserProfile {
  subscription: SubscriptionSummary;
  paymentCount: number;
  totalSpentCents: number;
  lastPaymentAt: string | null;
  hasPendingPayment?: boolean;
  isExpiringSoon?: boolean;
  isLifetime?: boolean;
}

export interface AuditLogEntry {
  id: string;
  adminId: string | null;
  adminName: string;
  action: string;
  recordId: string | null;
  result?: string;
  details: Record<string, unknown>;
  createdAt: string;
}
