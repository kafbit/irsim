export type Page = { id: string; title: string; boards: string[] }

const names = (list: string): string[] => list.trim().split(/\s+/)

export const PAGES: Page[] = [
  {
    id: 'sitemap',
    title: 'الشركة · خريطة الصفحات',
    boards: names(`
      Sitemap
    `),
  },
  {
    id: 'general',
    title: 'الشركة · عام — الرئيسية حتى التقارير',
    boards: names(`
      MainEmpty MainSales MainSalesEmpty MainLimited MainLimitedEmpty HomeRules FollowUps
      FollowUpsEmpty Calendar CalendarEmpty CalendarWeekly CalendarWeeklyEmpty CalendarWeekPanel
      Notifications NotificationsEmpty ReportsOverviewEmpty ReportsAbsorption ReportsForecast
      ReportsStock ReportsFloors ReportsPerformance ReportsRent ReportsRentEmpty Profile PhoneMain
      PhoneFollowUps MainV2 ReportsOverviewV2 ReportsV2 Favorites MainV2Import
    `),
  },
  {
    id: 'sales',
    title: 'الشركة · المبيعات',
    boards: names(`
      Leads LeadDetail LeadSuggestions LeadsImport LeadsImportSteps Pipeline PipelineTable
      Reservations Quotations Campaigns LeadsIncoming PhoneLeads PhoneLeadDetail LeadsEmpty
      LeadDetailEmpty PipelineEmpty ReservationsEmpty QuotationsEmpty CampaignsEmpty
      QuotationCreateDialogs QuotationEditor QuotationEditorPorted QuotationEditorReview
      QuotationPreview QuotationPreviewError LeadDetailQuotationsExpanded LeadQuotationStates
      QuotationCompare QuotationCompareInline QuotationPreviewOld QuotationNewPlugin
      QuotationNewNoPlugin
    `),
  },
  {
    id: 'inventory',
    title: 'الشركة · المخزون',
    boards: names(`
      Inventory PropertyDetail PropertyDetailStatus PropertyDetailAudit PropertyForm
      PropertyFormEdit PropertiesImport PropertiesImportSteps Projects ProjectsTable
      ProjectsByDeveloper ProjectDetail ProjectDetailImages ProjectDetailTerms
      ProjectDetailTermsEmpty ProjectDetailSettings ProjectDetailAudit ProjectUnits
      ProjectBuildingUnits ProjectForm ProjectFormEdit ProjectBuildings ProjectBuildingsDeleted
      BuildingForm BuildingFormEdit ProjectZones ProjectZonesDeleted Developers DevelopersImport
      DevelopersImportSteps InventoryEmpty ProjectsEmpty DevelopersEmpty DevelopersNew
      PhoneInventory PhonePropertyDetail PropertyFormBlocked ProjectFormBlocked
    `),
  },
  {
    id: 'admin',
    title: 'الشركة · الإدارة',
    boards: names(`
      Users UserDetail Roles Teams Jobs
    `),
  },
  {
    id: 'settings',
    title: 'الشركة · الإعدادات',
    boards: names(`
      SettingsCompany SettingsCurrencies SettingsLeads SettingsIntake SettingsPipeline
      SettingsProjects SettingsProjectsNewType SettingsProperties SettingsTemplates
      SettingsWhatsapp SettingsWhatsappPreview SettingsPlugins SettingsPluginsEmpty
      QuotationPluginUpload SettingsPluginDetail QuotationPluginLifecycle SettingsPluginTest
      SettingsPluginTestEditor SettingsPluginTestFailed
    `),
  },
  {
    id: 'public',
    title: 'الشركة · الصفحات العامة والدخول',
    boards: names(`
      PublicProject PublicProperty Login NotFound
    `),
  },
  {
    id: 'dialogs',
    title: 'الشركة · النوافذ المنبثقة والقوائم',
    boards: names(`
      DialogsSales DialogsInventory DialogsAdmin DialogsSettings DialogsShell
    `),
  },
  {
    id: 'platform-customers',
    title: 'المنصة · العملاء',
    boards: names(`
      SaCompanies SaCompaniesEmpty SaUsers SaSubscriptions SaOverview SaUsersEmpty
      SaSubscriptionsEmpty
    `),
  },
  {
    id: 'platform-monitoring',
    title: 'المنصة · المراقبة',
    boards: names(`
      SaErrors SaErrorsEmpty SaJobs SaIntegrations SaAudit SaIntegrationsEmpty SaAuditEmpty
    `),
  },
  {
    id: 'platform-system',
    title: 'المنصة · النظام والنوافذ',
    boards: names(`
      SaSidebar SaTopbar SaStaff SaSettings
    `),
  },
  {
    id: 'client',
    title: 'العميل',
    boards: names(`
      Landing
    `),
  },
  {
    id: 'components',
    title: 'مشترك · المكوّنات المشتركة',
    boards: names(`
      Topbar Sidebar Table SettingsNav ProjectNav FormSection ImportWizard Catalogue Dialogs
      DatePicker ImportFlow ExcelMenu FormActions TableStates Button Field Choice Badge Tabs Menu
      Alert Avatar Tooltip UIKit Select EmptyState ProbabilityInput WakeSlider
      WakeSliderPlayground Icons Checkbox PipelineQuotation ShellLoading FollowUpsLoading
      ReportsLoading LoadError LeadsIncomingLoading RecordDetailLoading LeadDetailLoading
      LoginLoading
    `),
  },
  {
    id: 'motion',
    title: 'مشترك · الحركة',
    boards: names(`
      Motion
    `),
  },
  {
    id: 'deprecated',
    title: 'قديم (Deprecated)',
    boards: names(`
      Main MainExcel ReportsOverview ReportsOverviewLow Reports DeprecatedMain MainLowData
      DeprecatedReports LeadQuotationsCard QuotationHistory
    `),
  },
]

const PAGE_BY_BOARD = new Map(
  PAGES.flatMap((page) => page.boards.map((board) => [board, page.id] as const)),
)

export const pageOf = (board: string): string | undefined => PAGE_BY_BOARD.get(board)
