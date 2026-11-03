// Public catalog examples are a preview, not connected accounts. Real inventory
// and availability always come from the person's own project.
export const APP_PREVIEW=[
  ['composio','Composio','Composio enables AI Agents an…','developer tools','composio.dev'],
  ['github','GitHub','议题、拉取请求和代码','developer tools','github.com'],
  ['supabase','Supabase','Supabase is an open-source ba…','developer tools','supabase.com'],
  ['firecrawl','Firecrawl','Firecrawl automates web crawli…','developer tools','firecrawl.dev'],
  ['serpapi','SerpApi','SerpApi provides a real-time API…','analytics','serpapi.com'],
  ['exa','Exa','Exa focuses on data extraction a…','analytics','exa.ai'],
  ['snowflake','Snowflake','Snowflake is a cloud-based data…','analytics','snowflake.com'],
  ['peopledatalabs','People Data Labs','People Data Labs provides B2B…','analytics','peopledatalabs.com'],
  ['adobe_marketing_agent_mcp','Adobe Marketing Agent MCP','Adobe Marketing Agent MCP pr…','model context protocol','adobe.com'],
  ['ahrefs_mcp','Ahrefs MCP','Analyze backlinks, organic searc…','model context protocol','ahrefs.com'],
  ['airops_mcp','AirOps MCP','AirOps MCP lets agents access …','model context protocol','airops.com'],
  ['aiwyn_tax_mcp','Aiwyn Tax MCP','Aiwyn Tax (formerly Column Ta…','model context protocol','aiwyn.ai']
].map(([slug,name,description,category,domain])=>({slug,name,description,categories:[category],logo:'https://logos.composio.dev/api/'+slug,domain,preview:true,builtIn:slug==='composio'}));
const DOMAINS={gmail:'gmail.com',notion:'notion.so',slack:'slack.com',googlecalendar:'calendar.google.com',googledrive:'drive.google.com',linear:'linear.app',sentry:'sentry.io',posthog:'posthog.com',discord:'discord.com',twitter:'x.com',reddit:'reddit.com',hubspot:'hubspot.com',salesforce:'salesforce.com',jira:'atlassian.com',asana:'asana.com',trello:'trello.com',dropbox:'dropbox.com',airtable:'airtable.com',figma:'figma.com',stripe:'stripe.com'};
export function appArtwork(card){const known=APP_PREVIEW.find(v=>v.slug===card.slug)||{},domain=DOMAINS[card.slug]||DOMAINS[card.slug.replaceAll('_','')];return {logo:card.logo||known.logo||('https://logos.composio.dev/api/'+encodeURIComponent(card.slug)),domain:card.domain||known.domain||domain};}
const NAMES={'developer tools':'开发者工具','developer-tools':'开发者工具',analytics:'分析',productivity:'效率工具',communication:'沟通',files:'文件','sales and crm':'销售与 CRM',design:'设计',marketing:'营销',social:'社交'};
export const categoryName=value=>NAMES[value.toLowerCase()]||value;
export function rankedCategories(cards){const counts=new Map();for(const card of cards)for(const name of new Set(card.categories||[]))counts.set(name,(counts.get(name)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name])=>name);}
export function categorySections(cards,names){return names.slice(0,3).map(name=>({name,cards:cards.filter(c=>c.categories?.includes(name)).slice(0,4)})).filter(s=>s.cards.length);}
