export type PluginCategory = 
  | 'popular'
  | 'installed'
  | 'new_noteworthy'
  | 'small_business'
  | 'productivity'
  | 'creativity'
  | 'developer_tools'
  | 'business_operations'
  | 'data_analytics'
  | 'communication'
  | 'education_research'
  | 'scientific_research'
  | 'security'
  | 'finance'
  | 'healthcare'
  | 'travel'
  | 'entertainment'
  | 'other';

export type AgentPlugin = {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  icon: string;
  url?: string;
  providerCompatibility: ('openai' | 'gemini' | 'claude' | 'custom')[];
  enabledByDefault?: boolean;
};

export const PLUGIN_CATEGORIES: { id: PluginCategory; label: string; icon: string }[] = [
  { id: 'popular', label: 'Populares', icon: '⭐' },
  { id: 'installed', label: 'Instalados / Core', icon: '⚡' },
  { id: 'new_noteworthy', label: 'Novedades', icon: '🔥' },
  { id: 'small_business', label: 'Pymes & Negocios', icon: '🏪' },
  { id: 'productivity', label: 'Productividad', icon: '⏱️' },
  { id: 'creativity', label: 'Creatividad & Multimedia', icon: '🎨' },
  { id: 'developer_tools', label: 'Herramientas de Desarrollador', icon: '💻' },
  { id: 'business_operations', label: 'Operaciones & Marketing', icon: '📈' },
  { id: 'data_analytics', label: 'Datos & Analítica', icon: '📊' },
  { id: 'communication', label: 'Comunicación', icon: '💬' },
  { id: 'education_research', label: 'Educación & Búsqueda', icon: '🎓' },
  { id: 'scientific_research', label: 'Investigación Científica', icon: '🔬' },
  { id: 'security', label: 'Seguridad & Privacidad', icon: '🛡️' },
  { id: 'finance', label: 'Finanzas & Mercados', icon: '💰' },
  { id: 'healthcare', label: 'Salud & Fitness', icon: '❤️' },
  { id: 'travel', label: 'Viajes & Rutas', icon: '✈️' },
  { id: 'entertainment', label: 'Entretenimiento & Juegos', icon: '🎮' },
  { id: 'other', label: 'Otros', icon: '🔮' },
];

export const ALL_CHATGPT_WORK_PLUGINS: AgentPlugin[] = [
  // 1. INSTALLED / CORE
  {
    id: 'plugin-documents',
    name: 'Documents',
    description: 'Lectura, creación y edición de documentos corporativos en tiempo real.',
    category: 'installed',
    icon: '📄',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-github-core',
    name: 'GitHub',
    description: 'Triage de PRs, issues, repositorios, CI/CD y publish flows.',
    category: 'installed',
    icon: '🐙',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-google-drive-core',
    name: 'Google Drive',
    description: 'Drive, Docs, Sheets o Slides integrados en el contexto del agente.',
    category: 'installed',
    icon: '📁',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-linear',
    name: 'Linear',
    description: 'Gestión moderna de issues, proyectos y sprint tracking para equipos ágiles.',
    category: 'installed',
    icon: '📐',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-default-templates',
    name: 'Default Templates',
    description: 'Plantillas prediseñadas para flujos de trabajo empresariales y minutas.',
    category: 'installed',
    icon: '📋',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-pdf-core',
    name: 'PDF',
    description: 'Extracción semántica, OCR y análisis de documentos PDF de cualquier tamaño.',
    category: 'installed',
    icon: '📑',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-presentations',
    name: 'Presentations',
    description: 'Generación y diseño automatizado de diapositivas y presentaciones ejecutivas.',
    category: 'installed',
    icon: '📽️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-spreadsheets',
    name: 'Spreadsheets',
    description: 'Modelado financiero, fórmulas complejas y visualización de hojas de cálculo.',
    category: 'installed',
    icon: '📊',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },

  // 2. POPULAR
  {
    id: 'plugin-gmail',
    name: 'Gmail',
    description: 'Lectura, redacción inteligente y gestión de bandeja de entrada Gmail.',
    category: 'popular',
    icon: '✉️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-outlook-email',
    name: 'Outlook Email',
    description: 'Triage y clasificación ejecutiva de buzones de Outlook.',
    category: 'popular',
    icon: '📬',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-canva-popular',
    name: 'Canva',
    description: 'Crear, revisar y editar diseños gráficos y piezas publicitarias.',
    category: 'popular',
    icon: '🎨',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-slack-popular',
    name: 'Slack',
    description: 'Lectura, monitoreo y mensajería en canales e hilos de Slack.',
    category: 'popular',
    icon: '💬',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },

  // 3. NEW & NOTEWORTHY
  {
    id: 'plugin-data-analysis',
    name: 'Data (ChatGPT Work)',
    description: 'Responder preguntas y derivar insights analíticos a partir de datasets masivos.',
    category: 'new_noteworthy',
    icon: '📈',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-tableau',
    name: 'Tableau',
    description: 'Explora y visualiza dashboards y modelos de business intelligence.',
    category: 'new_noteworthy',
    icon: '📊',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-power-bi',
    name: 'Microsoft Power BI',
    description: 'Explora y genera reportes analíticos de Microsoft en el navegador.',
    category: 'new_noteworthy',
    icon: '⚡',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-aws-analytics',
    name: 'AWS Data Analytics',
    description: 'Integración con Athena, Redshift, S3 y servicios de datos de Amazon Web Services.',
    category: 'new_noteworthy',
    icon: '☁️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-clickhouse',
    name: 'ClickHouse',
    description: 'Consultas ultra-rápidas en ClickHouse Cloud sobre bases de datos analíticas.',
    category: 'new_noteworthy',
    icon: '🏠',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-firebase',
    name: 'Firebase',
    description: 'Construye y administra apps con Firestore, Auth y Cloud Functions de Google.',
    category: 'new_noteworthy',
    icon: '🔥',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 4. SMALL BUSINESS
  {
    id: 'plugin-dropbox',
    name: 'Dropbox',
    description: 'Encuentra archivos, sube entregables y automatiza acciones en Dropbox.',
    category: 'small_business',
    icon: '📦',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-hubspot',
    name: 'HubSpot',
    description: 'Insights de clientes, automatización de CRM, leads y pipeline de ventas.',
    category: 'small_business',
    icon: '🧡',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-stripe',
    name: 'Stripe',
    description: 'Monitoreo de pagos, suscripciones, facturación y métricas de ingresos.',
    category: 'small_business',
    icon: '💳',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-figma-biz',
    name: 'Figma',
    description: 'Flujos de diseño a código (design-to-code) y lectura de componentes.',
    category: 'small_business',
    icon: '🎨',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 5. PRODUCTIVITY
  {
    id: 'plugin-google-calendar',
    name: 'Google Calendar',
    description: 'Administración de agendas, reuniones y detección de slots libres.',
    category: 'productivity',
    icon: '📅',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-notion',
    name: 'Notion',
    description: 'Búsqueda semántica, creación de páginas y bases de datos en Notion.',
    category: 'productivity',
    icon: '📓',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-outlook-calendar',
    name: 'Outlook Calendar',
    description: 'Gestión de agendas y sincronización de horarios corporativos en Microsoft 365.',
    category: 'productivity',
    icon: '📆',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-monday',
    name: 'monday.com',
    description: 'Gestión de proyectos, tareas de equipo y flujos de trabajo en tableros.',
    category: 'productivity',
    icon: '📋',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-fathom',
    name: 'Fathom',
    description: 'Transcripción, resúmenes automáticos y action items de videollamadas.',
    category: 'productivity',
    icon: '🎙️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-trello',
    name: 'Trello',
    description: 'Organiza tarjetas, listas y estados de tableros de Trello.',
    category: 'productivity',
    icon: '📌',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 6. CREATIVITY
  {
    id: 'plugin-higgsfield',
    name: 'Higgsfield',
    description: 'Generación avanzada de imágenes y video cinematográfico con múltiples modelos.',
    category: 'creativity',
    icon: '🎬',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-runway',
    name: 'Runway',
    description: 'Generación y edición multimodal de video impulsada por IA generativa.',
    category: 'creativity',
    icon: '🎥',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-invideo',
    name: 'invideo',
    description: 'Crea videos listos para publicar de cualquier duración a partir de guiones.',
    category: 'creativity',
    icon: '🎞️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-openart',
    name: 'OpenArt',
    description: 'Creación y experimentación visual con arte digital e imágenes personalizadas.',
    category: 'creativity',
    icon: '🖼️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-product-design',
    name: 'Product Design',
    description: 'Explora y prototipa ideas de producto, wireframes y especificaciones UX.',
    category: 'creativity',
    icon: '💡',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 7. DEVELOPER TOOLS
  {
    id: 'plugin-supabase-dev',
    name: 'Supabase',
    description: 'Administración de bases de datos PostgreSQL, SQL queries, autenticación y storage.',
    category: 'developer_tools',
    icon: '⚡',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
    enabledByDefault: true,
  },
  {
    id: 'plugin-exa',
    name: 'Exa',
    description: 'Búsqueda web neuronal de alta precisión diseñada especialmente para agentes IA.',
    category: 'developer_tools',
    icon: '🔍',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-railway',
    name: 'Railway',
    description: 'Despliegue, monitoreo de microservicios y bases de datos en Railway.',
    category: 'developer_tools',
    icon: '🚂',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-firecrawl',
    name: 'Firecrawl',
    description: 'Scraping y conversión limpia de sitios web completos a Markdown estructurado.',
    category: 'developer_tools',
    icon: '🕷️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-floot',
    name: 'Floot',
    description: 'Generación, compilación y hosting de aplicaciones full-stack completas.',
    category: 'developer_tools',
    icon: '🛠️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-vercel',
    name: 'Vercel',
    description: 'Deploy, control de dominios y logs de aplicaciones Next.js y Edge functions.',
    category: 'developer_tools',
    icon: '▲',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 8. BUSINESS & OPERATIONS
  {
    id: 'plugin-shopify',
    name: 'Shopify',
    description: 'Gestión de catálogo, pedidos, inventario y métricas de tiendas online.',
    category: 'business_operations',
    icon: '🛍️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-windsor',
    name: 'Windsor.ai',
    description: 'Conecta y sincroniza más de 350 fuentes de datos de marketing y publicidad.',
    category: 'business_operations',
    icon: '📊',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-vidiq',
    name: 'vidIQ',
    description: 'Estadísticas de YouTube, keywords de alto impacto y SEO para creadores.',
    category: 'business_operations',
    icon: '▶️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-ubersuggest',
    name: 'Ubersuggest',
    description: 'Análisis de palabras clave, backlinks y auditoría SEO en buscadores.',
    category: 'business_operations',
    icon: '📈',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-lusha',
    name: 'Lusha',
    description: 'Enriquecimiento y verificación de datos B2B, prospectos y tomadores de decisiones.',
    category: 'business_operations',
    icon: '🎯',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 9. DATA & ANALYTICS
  {
    id: 'plugin-posthog',
    name: 'PostHog',
    description: 'Analítica de producto, grabaciones de sesiones, feature flags y funnels.',
    category: 'data_analytics',
    icon: '🦔',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-helium10',
    name: 'Helium 10',
    description: 'Investigación de productos de Amazon, keywords y optimización de listings.',
    category: 'data_analytics',
    icon: '🎈',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-mixpanel',
    name: 'Mixpanel',
    description: 'Consultas avanzadas de comportamiento de usuarios y retención de cohortes.',
    category: 'data_analytics',
    icon: '📉',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-amplitude',
    name: 'Amplitude',
    description: 'Análisis de engagement digital y customer journeys en aplicaciones móviles y web.',
    category: 'data_analytics',
    icon: '📈',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 10. COMMUNICATION
  {
    id: 'plugin-teams',
    name: 'Microsoft Teams',
    description: 'Resumir canales de Teams, redactar seguimientos y agendar llamadas.',
    category: 'communication',
    icon: '👥',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-superhuman',
    name: 'Superhuman Mail',
    description: 'Asistente ultra-rápido de correo electrónico y gestión de calendario.',
    category: 'communication',
    icon: '⚡',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-zoom',
    name: 'Zoom',
    description: 'Insights de reuniones, minutas y resumen de puntos clave tratados en Zoom.',
    category: 'communication',
    icon: '📹',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 11. EDUCATION & SCIENTIFIC RESEARCH
  {
    id: 'plugin-consensus',
    name: 'Consensus',
    description: 'Búsqueda de evidencia científica basada en más de 200 millones de papers.',
    category: 'education_research',
    icon: '📚',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-scispace',
    name: 'SciSpace',
    description: 'Análisis y explicación de papers científicos complejos y literatura académica.',
    category: 'education_research',
    icon: '🔬',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-undermind',
    name: 'Undermind',
    description: 'Buscador científico autónomo que analiza papers y sintetiza hallazgos clave.',
    category: 'scientific_research',
    icon: '🧠',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-tamarind-bio',
    name: 'Tamarind Bio',
    description: 'Diseño molecular, predicción de estructuras de proteínas y bioinformática.',
    category: 'scientific_research',
    icon: '🧬',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 12. SECURITY & PRIVACY
  {
    id: 'plugin-codex-security',
    name: 'Codex Security',
    description: 'Escaneo de vulnerabilidades, dependencias y secretos expuestos en código.',
    category: 'security',
    icon: '🛡️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-malwarebytes',
    name: 'Malwarebytes',
    description: 'Verificación de dominios sospechosos, enlaces de phishing y amenazas digitales.',
    category: 'security',
    icon: '🔒',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-soluvery',
    name: 'Soluvery (Drive Auditor)',
    description: 'Auditoría de permisos y prevención de fugas de datos en carpetas de Google Drive.',
    category: 'security',
    icon: '🔐',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 13. FINANCE
  {
    id: 'plugin-ibkr',
    name: 'Interactive Brokers (IBKR)',
    description: 'Análisis de mercados globales, acciones, divisas y ETFs en tiempo real.',
    category: 'finance',
    icon: '🏛️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-alpaca',
    name: 'Alpaca Finance',
    description: 'Datos de mercado bursátil, criptomonedas y trading algorítmico automatizado.',
    category: 'finance',
    icon: '🦙',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-parqet',
    name: 'Parqet',
    description: 'Monitoreo de carteras de inversión, rendimientos históricos y dividendos.',
    category: 'finance',
    icon: '📊',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },

  // 14. HEALTHCARE & TRAVEL
  {
    id: 'plugin-health-apple',
    name: 'Health Connector',
    description: 'Explora métricas de bienestar, descanso y parámetros de salud.',
    category: 'healthcare',
    icon: '❤️',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-skyscanner',
    name: 'Skyscanner',
    description: 'Búsqueda y comparación de vuelos baratos, rutas y disponibilidad global.',
    category: 'travel',
    icon: '🛫',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-booking',
    name: 'Booking.com',
    description: 'Búsqueda de hoteles, alojamientos y traslados para viajes corporativos.',
    category: 'travel',
    icon: '🏨',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
  {
    id: 'plugin-spotify',
    name: 'Spotify',
    description: 'Búsqueda y análisis de música, podcasts y listas de reproducción de audio.',
    category: 'entertainment',
    icon: '🎵',
    providerCompatibility: ['openai', 'gemini', 'claude', 'custom'],
  },
];
