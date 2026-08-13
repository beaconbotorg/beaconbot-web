/* Browser-safe role configuration. Keep bot tokens and Discord OAuth secrets on your backend only. */
window.DISCORD_PORTAL_CONFIG={
  guildId:'1411544013848449076',
  apiBaseUrl:'/api',
  roleHierarchy:{
    member:['1411544013848449078'],
    support:['1411544014200504418'],
    management:['1411544014225932315'],
    developer:['1411544014242713661'],
    leaddev:['1411544014242713668'],
    coreteam:['1411544014242713666']
  },
  roleLabels:{
    member:'Community Member',
    support:'Support Team',
    management:'Management',
    developer:'Developer',
    leaddev:'Lead Developer',
    coreteam:'Core Team'
  },
  permissions:{
    member:['create_ticket','create_application','create_appeal','live_chat'],
    support:['view_assigned_tickets','manage_tickets','live_chat'],
    management:['manage_tickets','view_applications','review_appeals','live_chat'],
    developer:['manage_tickets','view_applications','live_chat'],
    leaddev:['manage_tickets','review_applications','live_chat'],
    coreteam:['*']
  }
};
