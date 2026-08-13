/* Staff form configuration. Add, remove, or edit questions here. */
window.PORTAL_FORM_CONFIG={
  tickets:{
    'General support':[ {label:'Discord username',placeholder:'Your Discord username',required:true} ],
    'Member report':[ {label:'Member name / ID',placeholder:'Who are you reporting?',required:true},{label:'Evidence link',placeholder:'Screenshot, message link, or video',required:false} ],
    'Bot issue':[ {label:'Steps to reproduce',placeholder:'What happened before the issue?',required:true},{label:'Evidence link',placeholder:'Screenshot or screen recording link',required:false} ]
  },
  appeals:{
    'Ban appeal':[
      {label:'Discord username',placeholder:'Your Discord username',required:true},
      {label:'Ban reason',placeholder:'The reason shown on your ban',required:true},
      {label:'Ban date',placeholder:'When you were banned (approximate is fine)',required:true}
    ]
  },
  applications:{
    'Support application':[ {label:'Discord username',placeholder:'Your Discord username',required:true},{label:'Support experience',placeholder:'Describe your moderation or support experience',required:true},{label:'Availability',placeholder:'Hours per week you can help',required:true} ],
    'Partner proposal':[ {label:'Organisation name',placeholder:'Your team or community name',required:true},{label:'Proposal summary',placeholder:'Describe the partnership idea',required:true} ],
    'Bot integration':[ {label:'Server name',placeholder:'Your Discord server name',required:true},{label:'Server ID',placeholder:'Your Discord server ID',required:true},{label:'Integration type',placeholder:'Webhooks, logging, auto-mod, etc.',required:true},{label:'Use case',placeholder:'Describe what you need Beacon Bot to do',required:true} ]
  },
  applicationReviewAccess:{
    'Support application':['coreteam','management'],
    'Partner proposal':['coreteam','management'],
    'Bot integration':['coreteam','management']
  },
  appealReviewAccess:['management','coreteam']
};
