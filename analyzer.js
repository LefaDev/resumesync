/* ============================================================
   ResumeSync — keyword matching engine (pure logic, no DOM)
   Exposed as `ResumeAnalyzer` in the browser and via
   module.exports in Node (for testing).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ResumeAnalyzer = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ---------- text helpers ---------- */

  const squash = (s) =>
    String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

  // All reasonable morphological variants of a normalized token.
  function* forms(n) {
    yield n;
    if (n.length > 4 && n.endsWith('ies')) yield n.slice(0, -3) + 'y';
    if (n.length > 4 && n.endsWith('es')) yield n.slice(0, -2);
    if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) yield n.slice(0, -1);
    if (n.length > 5 && n.endsWith('ing')) yield n.slice(0, -3);
    if (n.length > 4 && n.endsWith('ed')) yield n.slice(0, -2);
  }

  // Crude stemmer used only for presence checks (mentoring <-> mentored).
  const stem = (n) => {
    if (n.length > 5 && n.endsWith('ing')) return n.slice(0, -3);
    if (n.length > 4 && n.endsWith('ed')) return n.slice(0, -2);
    if (n.length > 3 && n.endsWith('d')) return n.slice(0, -1);
    return n;
  };

  const inSet = (set, n) => {
    for (const f of forms(n)) if (set.has(f)) return true;
    return false;
  };

  /* ---------- stopwords (grammar glue, never keywords) ---------- */

  const STOPWORDS = new Set((
    'a about above after again against all am an and any are aren\'t as at be because been before being below between both but by ' +
    'can can\'t cannot could couldn\'t did didn\'t do does doesn\'t doing don\'t down during each either else even ever every few for from further ' +
    'get gets getting got had hadn\'t has hasn\'t have haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him himself his how how\'s ' +
    'i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s like me more most much mustn\'t my myself no nor not of off on once one only or ' +
    'other others ought our ours ourselves out over own same shan\'t she she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their theirs ' +
    'them themselves then there there\'s these they they\'d they\'ll they\'re they\'ve this those through to too under until up us very was wasn\'t we we\'d we\'ll ' +
    'we\'re we\'ve were weren\'t what what\'s when when\'s where where\'s which while who who\'s whom why why\'s will with won\'t would wouldn\'t you you\'d you\'ll ' +
    'you\'re you\'ve your yours yourself yourselves also just still really actually quite rather often always never sometimes usually already yet soon now ' +
    'today here there where when why how all any some no every each many much more most other another such only own same too very can will just don\'t doesn\'t ' +
    'make makes made take takes took get got give gives gave know knows knew think thinks thought want wants wanted need needs needed let lets put puts keep keeps ' +
    'kept say says said tell tells told come comes came go goes went use uses used find finds found work works worked call calls called try tries tried ask asks ' +
    'asked feel feels felt become becomes became leave leaves left mean means meant help helps helped show shows showed hear hears heard play plays played run ' +
    'runs ran move moves moved live lives lived believe believes believed bring brings brought happen happens happened write writes wrote sit sits sat stand ' +
    'stands stood lose loses lost pay pays paid meet meets met include includes included continue continues continued set sets learn learns learned change changes ' +
    'changed lead leads led understand understands understood watch watches watched follow follows followed stop stops stopped create creates created speak ' +
    'speaks spoke read reads allow allows allowed add adds added spend spends spent grow grows grew open opens opened walk walks walked win wins won offer ' +
    'offers offered remember remembers remembered love loves loved consider considers considered appear appears appeared buy buys bought wait waits waited serve ' +
    'serves served die dies died send sends sent expect expects expected build builds built stay stays stayed fall falls fell cut cuts reach reaches reached ' +
    'kill kills killed remain remains remained suggest suggests suggested raise raises raised pass passes passed sell sells sold require requires required ' +
    'report reports reported decide decides decided pull pulls pulled along among amongst within without upon toward towards via per amid plus etc ie eg vs using ' +
    'e.g i.e neither nor none nothing nobody someone anyone everyone something anything everything wherever whenever however therefore thus hence ' +
    'otherwise instead ll ve re im first second third next last yes ok hi hello dear www http https com word words'
  ).split(/\s+/).filter(Boolean));

  /* ---------- noise words (JD filler / generic resume vocabulary)
     NOTE: must never contain a TECH / SOFT / METHODS term or a
     domain keyword we want to detect. ---------- */

  const NOISE = new Set((
    // generic filler
    'able account accounts across action actions activity activities add adds added adding additional approach area areas around aspect aspects ' +
    'assist assistance associate attitude attention available availability aware away back background backgrounds balance base based basic basically ' +
    'basis benefit benefits better beyond big bit bits boost bottom box boxes branch bread break brief bright bring broad brochure brother brown brush ' +
    'build builds building buffer bug bugs bureau burn burst business businesses busy buyer buyers calm campaign campaigns capability capabilities ' +
    'capable capacity capital captain capture card cards care career careers careful carry case cases cash cast casual catch category cause causes ' +
    'caution cautious caveat celebrate cell center central certain certainly chain challenge challenges challenging chance chances change changes ' +
    'changed changing channel channels charge charged chart charts check checks cheer chief choice choices choose chore chunk circle circumstance ' +
    'city civil claim claims clarify class classes classic clean clear clearly clerk click climate climb clock close closed closely clue code coded ' +
    'codes coding coffee cold collapse colleague colleagues collect collection collective college color column combination combine comfort comfortable ' +
    'coming command comment comments commercial commission commit commitment committed committee common commonly communicate communicates communicating ' +
    'company companies compare compete competition competitive complain complete completed completely complex complexity component components compose ' +
    'computer concentrate concept concepts concern concerns concrete condition conduct conducting conference confidence confirm conflict conflicts ' +
    'confuse connect connection connections conscious consensus consequence consider consist constant consult consultant consultants consulting consumer ' +
    'consumers contact contacts contain content context continue contribute control convenient convince cool coordinate cope copy core corporate correct ' +
    'cost costs council count country couple courage course courses cover coworker craft crash create creation credit credits crew crews criteria ' +
    'critical cross crowd crucial crush culture current currently curriculum custom customer customers cut cuts cycle cycles daily damage danger dare ' +
    'dark date day days deal deals debate debt decade decide deck decks declare deep deeply default defeat defend define definitely degree degrees ' +
    'deliver delivered delivers delivering delivery demand demo demos department departments depend deploy deposit depth deputy describe description ' +
    'design designs designed designer designers designing despite detail details detect determine develop developed developer developers developing ' +
    'development device devices devote diagram dialogue die diet differ difference different difficult difficulty dig digital direct direction directions ' +
    'director directors directory disable disclose discount discover discuss discussion disease dispatch display distance distinct distribute district ' +
    'disturb dive diverse divide division doc docs document dollar domain done donate door double doubt dozen draft drag drama draw dream dress ' +
    'drift drill drive drives driven driving drop drug dry dual due dull duration duty eager early earn ease easily east easy echo edge edit edits ' +
    'editor editors education educational effect effective effectively effectiveness efficiency efficient effort efforts ego eight elect electric ' +
    'element elements elevate eleven eligible else email emails embark embarrass embed emergency emphasis emphasize employ employee employees employer ' +
    'employers employment empty enable encounter encourage end ends ending enemy energy enforce engage engaged engine engineering engineer engineers ' +
    'enjoy enough ensure enter entire entry environment environments equal equally equipment equivalent error errors essay essence essential establish ' +
    'estate estimate evaluate even event events ever every everyday everyone everything everywhere evidence exact exactly exam example examples exceed ' +
    'excellent except exchange excite excitement exciting excuse execute execution exercise exist existing expand expect expectation expectations expense ' +
    'experience experienced experiences experiencing experiment experiments expert expertise experts explain explicit explore export expose express extend ' +
    'extensive extent external extra extras extreme eye fabric face faces facilitate facility fact factor factory fail failure fair fairly faith fall ' +
    'false familiar family famous fancy far fare fashion fast faster fastest fate fault favor fear feature features fee feed feel fellow felt female ' +
    'fence fiber fiction field fields figure file files fill film filter final finally finance financial find finding fine finish fire firm firms first ' +
    'fiscal fit fix flag flat flavor fleet flesh flight float flood floor flow focus fold folk follow following fond food fool foot force fore forecast ' +
    'forecasts foreign forest forever forget forgive fork form format former forms formula forth fortune forward found foundation founder founders ' +
    'frame framework frameworks frank free freedom freelance frequent frequently fresh friend friendly friendship front fruit fuel full fully fun function ' +
    'functions fund funds funny furniture further future gain game games gap garage garden gas gate gather gay gear general generally generate generation ' +
    'generous genius genre gentle get giant gift girl give gives gave given giving glad glance glass global glove glow goal goals god gold good goods ' +
    'grab grade gradually grain grand grant graph grasp grass grateful great greater greatest green greet grid grief grill grip grocery gross ground ' +
    'group groups grow growth guarantee guard guess guest guide guideline guidelines guilt guitar gum guy gym habit hair half hall hand handle handout ' +
    'hang happen happy hard harder hardest hardly harm hat hate have head headquarters health heal heap hear heart heat heaven heavy heel height hello ' +
    'help hem hence her hero hesitate hi hidden hide high higher highest highlight highly highway hike hill hint hire hiring history hit hobby hold hole ' +
    'holiday hollow holy home homework honest honey honor hope horizon horn horrible horse host hot hour hours house household housing how however ' +
    'huge human humans hundred hunger hunt hurry hurt husband ice idea ideas ideal identify identity ie if ignore ill illegal illness image imagination ' +
    'imagine immediate immediately implement implementation imply import importance important impress improve improved improvement improvements incentive ' +
    'incident incidents include including income increase indeed independence independent index indicate individual individuals industry inevitable ' +
    'infect inflation influence inform informal information ingredient initial inject injure inner innocent innovation innovative input inquire inside ' +
    'insight insist inspect inspire install instance instant instead instruct instrument insult insurance intake integrate intellectual intelligence ' +
    'intend intense intensity intent interest interested interesting internal international internet internship internships interpret interview into ' +
    'introduce invention inventory invest investigate investment investments investor investors invisible invite involve involved iron island issue issues ' +
    'item items jacket job jobs join joke journal journey joy judge juice jump junior just justice justify keen keep kettle key keys kick kid kill kind ' +
    'kinds king kitchen knee knife knock know label labor lack ladder lady lake lamp land landscape lane language laptop large largely laser last late ' +
    'lately laugh launch lay layer lazy lead leader leaders leading leaf league learn learning leave lecture left leg legal legend leisure lemon lend ' +
    'length less lesson let letter level levels liar liberal liberty library license life lifestyle lift light like likely limb limit line link lion lip ' +
    'liquid list listen literature little live load lobby local locate location lock log logic logical lonely long look loop loose lord lose loss lost ' +
    'lot lots loud love lovely low lower loyal luck lunch lung luxury machine machines magic magnet mail main mainly maintain manual manufacture many ' +
    'map march margin mark market markets marketing marriage mask mass master masters match mate material materials math matter maximum may maybe meal ' +
    'mean meaning means meant measure measurement meat medium meet meeting member members membership memory mental mention menu merchant mere merely ' +
    'mess message metal meter method methods middle might mile milk million mind mine mini minor minimum minute miracle mirror miss mission mistake mix ' +
    'mode model models moderate modern modest mom moment money month months mood moon more morning most mostly mother motion motivate motor mount ' +
    'mountain mouse mouth move movie much mud multiple muscle museum must mutual my myself mystery myth name nation native natural nature near neat ' +
    'necessary neck need negative negotiate neighbor nerve nervous never new newer newly news next nice night nine no nobody noise none noon nor normal ' +
    'north nose not note nothing notice notify novel now nowhere nuclear number numbers numerous nut object objects objective objectives obligation ' +
    'observe obtain obvious occasion occupation occupy occur ocean offer office officer official often oil old once one ongoing online only open operate ' +
    'opinion opponent opportunity oppose opposite option options order ordinary organ organization organizations organize orient oriented origin ' +
    'original other otherwise ought our ours out outcome outcomes outdated outdoor outer outline output outside outstanding over overall overcome ' +
    'overhead overlap overlook overnight owe own owner pace pack package packages page pain paint pair palace pale palm panel panic pant paper parent ' +
    'park part parts participant participate particular particularly partner partners partnership party pass passage passion past pat patch path pattern ' +
    'pause pay peace peak pen penalty pencil people per perceive percent perception perfect perform performance period permanent permission person ' +
    'personal perspective persuade pet phase phone photo phrase physical piano pick picture piece pig pile place plan plane planet plant plastic plate ' +
    'platform play please pleasure plenty plot plug plus pocket poem point pole policy political pollution pool poor pop popular population port portion ' +
    'portrait pose position positions positive possess possible post poster pot potential pound pour poverty powder power powerful practical practice ' +
    'practices praise pray precise predict prefer preference pregnant prepare presence present preserve press pressure pretend pretty prevent previous ' +
    'previously price pride priest primarily primary prime principal principle print prior priority prison prize probably problem problems procedure ' +
    'procedures process processes produce product products production profession professional professionally professor profile profit program programs ' +
    'progress project projects promise promote prompt proper property properties proposal propose prospect protect proud prove provide provider province ' +
    'provision psychological public publish pull pump punch punish purchase pure purpose pursue push put puzzle quality quarter queen question quick ' +
    'quickly quiet quit quite quote race racial rack radar radiation radio rail rain raise rally random range rank rapid rapidly rare rate rather ' +
    'rating ratio raw reach read reader reading ready real really reality realize reason reasonable recall receive recent recently recipe recognize ' +
    'recommend record recover reduce refer reference reflect reform refuse regard region register regret regular regulate reinforce reject relate ' +
    'relation relations relationship relative relax release relevant reliable relief religion rely remain remember remind remote remove rent repeat ' +
    'replace reply report represent request require requirement requirements resemble reserve reside residence resign resist resolution resolve resort ' +
    'resource respond response responsibility responsibilities responsible rest restore restrict result results resume retain retire return reveal ' +
    'revenue review revise reward rhythm rice rich rid ride right ring rise risk risks river road rob rock role roles roll roof room root rope rough ' +
    'round route routine row royal rub rude rule rules run rural rush sad safe safety salary sample sanction sand satellite satisfy save saving ' +
    'say scale scan scare scene schedule scheme scholar school science score screen script sea season seat second section sector secure see seed seek ' +
    'seem segment select self sell semester send senior sense sensitive sentence separate sequence series serious serve service services session set ' +
    'setting settle seven several sex shade shadow shake shall shame shape share sharp sheet shelf shift shine ship shirt shock shoe shoot shop shore ' +
    'short shortly shot should shoulder shout show shower shrink shut sick side sign signal significance significant silence silly silver similar ' +
    'simple simply since sing single sister sit site situation six size ski skill skills skin sky sleep slice slide slight slogan slope slow small ' +
    'smart smile smoke smooth snack snake snap snow so soap soccer social society sock soft software soil solar solid solution solutions solve some ' +
    'somebody somehow someone something sometime sometimes somewhat somewhere song soon sophisticated sore sorry sort soul sound soup source sources ' +
    'south space spare spark speak special specialist specialists specific specifically speech speed spell spend spending spice spider spin spirit ' +
    'spiritual split spoke spokesperson sponsor spoon sport spot spread square squeeze stability stable staff stage stair stake stand standard standards ' +
    'star stare start state statement station statistics status stay steady steal steam steel steep steer stem step steps stereo stick stiff still ' +
    'sting stir stock stocks stomach stone stop storage store storm story straight strain strange strategy stream street strength strengths ' +
    'strengthen stress stretch strict strike string strip stroke strong stronger strongest strongly structure structures struggle stuck student ' +
    'students study studying stuff style subject submit subscribe subsequent substance succeed success successful successfully such sudden suddenly ' +
    'suffer sufficient sugar suggest suggestion suit suitable sum summary summer summit sun super superior supervise supervisor supervisors supply ' +
    'support supporter suppose sure surely surface surprise surround survey survive suspect sustain swallow swap swear sweet swim swing switch symbol ' +
    'sympathy sync system systems table tackle tactic tail take talent talents talk tall tank tap tape target task tasks taste tea teach teacher ' +
    'teachers teaching team teams tear tech technical technique technology technologies teen teeth telephone tell temper temperature template ' +
    'temporary ten tend tension term terms terrible territory test tests text than thank that theater their them theme then theory there therefore ' +
    'these thick thin thing things think third thirsty this thorough those though thought thousand thread threat three throat through throughout ' +
    'throw thumb thunder thus tie tight time timer times tiny tip tire tissue title to today toe together toilet tomato tomorrow tone tongue tonight ' +
    'too tool tools top topic toss total totally touch tough tour toward town toy trace track trade traffic transfer transform translate transport ' +
    'trap tray treat tree trend trial tribe trick trip troop trouble truck true truly trunk trust truth try tube tuition tumble tune turn twelve ' +
    'twenty twice twin two type types typical ugly ultimate unable uncle under undergo understand understanding undertake unemployment unfair ' +
    'unfamiliar unfortunately uniform union unique unit units university unknown unless unlike unlikely until unusual up upon upper upset urban urge ' +
    'us use used useful user users usual usually utility utilize utmost utter vacation vague valid valley valuable value values van vanish variable ' +
    'variety various vary vast vegetable vehicle venture verb verbal version versions very vessel veteran veterans via vice victim victory view viewer ' +
    'village violate violence virtual virtue visa visible vision visit visitor visual vital voice volume volunteer vote wage wait wake walk wall ' +
    'wander want war warm warning wash waste watch water wave way ways weak wealth weapon wear weather web website wednesday week weeks weekend weekly ' +
    'weigh weight weird welcome welfare well west wet what whatever wheel when whenever where whether which while whisper white who whole whom whose ' +
    'why wide widely width wife wild will win wind window wine wing winner winter wipe wire wisdom wise wish with within without witness woman ' +
    'wonder wonderful wood wool work worked worker workers working works workshop world worried worry worth would wound wrap write writer writers ' +
    'writing wrong yard yeah year years yell yellow yes yesterday yet you young your yours youth zero zone ' +
    // company suffixes & titles
    'llc inc ltd corp corporation gmbh pty srl bv nv oy ab llp plc hands paced cutting world class exceptional talented qualified certified diploma ' +
    'gpa graduate academic looking join quota commission contributions daily studies experiments gates automated automate maintain operate operating ' +
    'run running execute executed executing execution implement implemented implementing implementation deploy deployed deploying deployment release ' +
    'releases released releasing migrate migrated migrating migration integrate integrated integrating integration collaborate coordinate facilitate ' +
    'organize plan plans planning prioritize reduce reduced reducing reduction achieve achieved achievement accomplishments deliverable deliverables ' +
    'milestone milestones timeline timelines deadline deadlines benchmark benchmarks scope range phase layer layers prerequisite prerequisites ' +
    'optional ideal ideally least minimum maximum enhance enhanced enhancing enhancement boost accelerate streamline simplify transform modernize ' +
    'upgrade refactor rebuild overhaul revamp tune tuning fine refine iterate evolve adapt adopt validate verify measure track assess evaluate audit ' +
    'inspect investigate diagnose resolve fix repair debug troubleshoot script generate produce craft shape model prototype interest influence ' +
    'leverage exposure awareness oversight supervision coordination administration strategy strategic operational executive values mission morale ' +
    'satisfaction journey story perception reputation image identity presence visibility recognition climate accommodate accommodation visa ' +
    'sponsorship relocation scheduling roster shift shifts overtime vacation holidays leave absence attendance availability capacity capability ' +
    'capabilities able capable competent competence competencies skill skills skilled expertise expert expert-level proficiency proficient familiar ' +
    'familiarity knowledge knowledgeable understanding comprehension grasp insight insights conscious cognitive mental intellectual scholarly ' +
    'scientific technological online virtual augmented artificial intelligence robotic mechanical electrical electronic computer computing ' +
    'informatics evidence evidence-based fact facts figure figures statistic statistics numerical quantitative qualitative measurement metrics ' +
    'indicator indicators index indices criteria criterion benchmark benchmarks output outputs serving solution solutions solve solver resolution ' +
    'maintenance upkeep supporting assist assistance helpful aid aide enable enabled enabling empower feasible viable sustainable scalable robust ' +
    'resilient consistency assurance control guarantee warranty compliance compliant regulatory regulation regulations regulator policy policies ' +
    'protocol protocols methodology methodologies technique techniques method methods practice practices habit routine workflow workflows assembly ' +
    'fabrication construct constructed blueprint schematic modeling specimen illustration demonstration presenting perform operational functional ' +
    'functionality attribute attributes characteristic characteristics trait traits advantage advantages precious worth merit merits demerits ' +
    'pros cons tradeoff tradeoffs compromise balanced mix mixture blend fusion synthesis analytic diagnose diagnosis diagnostic therapy treatment ' +
    'remedy cure healing recover restore renew renovate invention invent inventor pioneer trailblaze breakthrough disruption transition migration ' +
    'evolution adaptive adjust adjustment modify modification customize custom tailor tailored align synchronize segregate separate combine merge ' +
    'split divide distribute disseminate shared sharing cooperate coordination communicate communicated liaise liaison interact interaction engage ' +
    'participate participation involve involvement exclude exclusive equality fairness justice bias prejudice discrimination harassment bullying ' +
    'respectful courtesy polite etiquette manners amateur novice beginner intermediate advanced specialist generalist guru train educate ' +
    'education instruct instruction learning studying investigate examine inspect observe monitor surveillance tracking trace pursue pursuit quest ' +
    'adventure inexperienced rookie green apprentice intern staff crew squad platoon company battalion brigade regiment corps guild society ' +
    'association club league union federation alliance coalition consortium conglomerate syndicate cooperative coop neighborhood locality ' +
    'quarter borough province county territory locale vicinity proximity nearby distant whichever whatever whoever whomever whatsoever whenever ' +
    'wherever however moreover furthermore additionally meanwhile otherwise nevertheless nonetheless notwithstanding albeit approximately roughly ' +
    'nearly almost quite rather pretty fairly somewhat partially totally completely entirely fully wholly purely merely simply only solely ' +
    'exclusively inclusively supplementary complementary opposite contrary conversely inversely versa ipso facto adhoc ex officio status quo ' +
    'manage managed management manager managers managing analyst analysts researcher researchers pipeline pipelines ' +
    'engineer engineers developer developers designer designers technician technicians intern interns internship internships ' +
    'specialist specialists consultant consultants associate associates coordinator coordinators'
  ).split(/\s+/).filter(Boolean));

  /* ---------- tech / tools (boosted as critical keywords) ---------- */

  const TECH = new Set((
    'aws azure gcp ai ml ux ui qa api apis sdk ide cli gui db dbs orm nosql rdbms etl elt olap oltp ci cd cicd sre devops devsecops mlops gitops erp crm hris ' +
    'scm wms tms mrp mes qms plm hr pm hvac cdn gdpr hipaa soc2 iso27001 pcidss nist kyc aml sso mfa 2fa saml oauth oidc jwt ldap kerberos pki ssl ' +
    'tls ssh sftp scp vpn dns dhcp nat vlan vxlan bgp ospf mpls qos cidr icmp snmp syslog tcp udp http https httpd websocket websockets rest ' +
    'restful graphql grpc soap protobuf json yaml yml xml toml csv parquet avro ec2 s3 rds eks ecs fargate ecr iam vpc sns sqs ses kinesis firehose ' +
    'glue athena emr redshift aurora dynamodb elasticache cloudfront route53 apigateway lambda stepfunctions eventbridge cloudwatch cloudtrail kms ' +
    'cognito aks cosmosdb keyvault synapse gke gce bigquery bigtable dataproc dataflow pubsub spanner firestore firebase gcr cloudflare heroku netlify ' +
    'vercel digitalocean linode vultr ovh openstack docker kubernetes k8s helm istio linkerd envoy traefik nginx haproxy apache tomcat iis caddy ' +
    'jetty websphere weblogic jboss wildfly payara glassfish lighttpd varnish squid zuul gateway apigee mulesoft boomi tibco wso2 containerd podman ' +
    'crio openshift rancher k3s minikube kind kustomize argocd argo flux tekton prometheus grafana datadog newrelic splunk kibana elasticsearch ' +
    'opensearch sentry pagerduty dynatrace honeycomb zabbix nagios terraform pulumi cloudformation ansible puppet saltstack vagrant packer etcd ' +
    'zookeeper rabbitmq activemq kafka pulsar nats neo4j clickhouse influxdb timescaledb supabase mysql mariadb postgres postgresql psql sqlite ' +
    'mssql sqlserver snowflake databricks hadoop spark hive presto trino flink airflow dbt mlflow kubeflow iceberg javascript js typescript ts tsx ' +
    'jsx babel webpack vite rollup esbuild swc eslint prettier stylelint husky react reactjs preact angular angularjs vue vuejs svelte sveltekit ' +
    'next nextjs nuxt nuxtjs gatsby astro remix redux mobx vuex pinia ngrx rxjs apollo storybook jest mocha jasmine karma vitest ava cypress ' +
    'playwright selenium appium enzyme browserstack testng cucumber gherkin codecov ktlint pytest python py django flask fastapi pandas numpy ' +
    'scipy sklearn scikitlearn tensorflow pytorch keras jupyter opencv cv2 xgboost nltk spacy langchain llamaindex openai llm llms gpt cuda java jvm ' +
    'scala groovy kotlin clojure spring springboot hibernate jpa junit mockito maven gradle swagger openapi jenkins jenkinsx gocd android ios swift ' +
    'objectivec swiftui jetpack compose reactnative flutter dart xamarin ionic cordova capacitor electron tauri c cpp csharp dotnet netcore aspnet ' +
    'blazor wpf uwp xaml golang go rust cargo perl lua haskell elixir erlang julia matlab ruby rails php laravel lumen symfony wordpress drupal joomla ' +
    'magento woocommerce shopify express koa fastify nestjs hapi node nodejs gin ktor ember backbone knockout jquery bash shell zsh powershell pwsh ' +
    'linux unix ubuntu debian centos rhel fedora alpine suse gentoo windows macos osx excel vba powerpoint outlook sharepoint onedrive zoom slack ' +
    'discord jira confluence trello asana clickup notion airtable smartsheet wrike basecamp github gitlab bitbucket gitea svn mercurial perforce ' +
    'circleci travisci githubactions bamboo teamcity buildkite drone concourse sonarqube sonarcloud artifactory nexus snyk trivy grype checkov ' +
    'kyverno falco slither openzeppelin owasp burpsuite metasploit wireshark nmap netcat socat curl wget jq strace gdb lldb valgrind objdump lsof ' +
    'netstat traceroute mtr iptables nftables ufw fail2ban ossec wazuh awk sed grep xargs diff rsync tmux vim emacs vscode webstorm intellij eclipse ' +
    'xcode androidstudio tableau looker qlik powerbi superset metabase sap netsuite workday bamboohr quickbooks xero odoo salesforce hubspot marketo ' +
    'pardot eloqua zendesk freshdesk intercom klaviyo mailchimp sendgrid mailgun twilio postman webflow contentful strapi sitecore figma sketch ' +
    'illustrator photoshop indesign aftereffects premiere lightroom canva miro lucidchart drawio visio balsamiq invision zeplin gimp inkscape krita ' +
    'blender unity unreal godot gamemaker pygame phaser pixi threejs babylonjs html css sass scss tailwind bootstrap bulma mui antd chakra ' +
    'styledcomponents postcss gulp grunt npm yarn pnpm pip pipenv poetry conda cmake make ninja bazel composer nuget cocoapods deno obsidian ' +
    'stripe paypal adyen plaid klarna affirm bitcoin ethereum crypto cryptocurrency blockchain defi nft nfts web3 solidity coinbase ipfs solana ' +
    'evm wasm hyperledger rbac abac hl7 fhir ehr dicom bcrypt argon2 aes rsa soc siem edr xdr ocsp keycloak okta auth0 duo forgerock cissp oscp ceh ' +
    'comptia securityplus oci ibm alibaba tencent huawei baidu nutanix vmware hyperv esxi qemu libvirt proxmox kvm swarm ingress certmanager keda ' +
    'knative openfaas kubeless fission nuclio msk eventhubs servicebus datafactory purview lakeformation spectrum quicksight memorydb neptune ' +
    'documentdb elasticbeanstalk prisma typeorm sequelize mongoose dapper entityframework jooq liquibase flyway knex objection bookshelf waterline ' +
    'sanity prismic dato ghost headless jamstack jekyll hugo eleventy gridsome qwik marko alpine htmx turbo stimulus liveview inertia livewire ' +
    'filament nova backpack silex micro noir ratpack vertx micronaut quarkus dropwizard boot config bus stream sleuth zipkin brave jaeger ' +
    'opentelemetry otel thanos cortex mimir loki tempo pyroscope kiali osm linkerd consul connect nomad vault boundary waypoint crossplane ' +
    'helmfile kustomize kapitan jsonnet cue dhall trpc socketio celery sidekiq bullmq seo sem ppc kpi ctr roi cms gtm adwords google d3 d3js wcag ' +
    'iot vr ar xr mqtt scada plc hmi modbus cad mes elastalert kibana logstash fluentd fluentbit graylog amplitude mixpanel segment rudderstack ' +
    'snowplow gtag analytics tagmanager adsense instagram youtube tiktok snapchat pinterest reddit twitter medium substack wix squarespace ' +
    'prestashop bigcommerce mollie razorpay squareup venmo zelle wise revolut'
  ).split(/\s+/).filter(Boolean));

  /* ---------- soft skills ---------- */

  const SOFT = new Set((
    'communication communications presentation presentations leadership teamwork collaboration collaborative interpersonal negotiation creativity ' +
    'creative adaptability adaptable flexibility flexible mentoring mentorship mentor coaching coach facilitation persuasion storytelling listening ' +
    'speaking empathy analytical prioritization organizational multitasking professionalism reliability dependable accountability initiative proactive ' +
    'resilience curiosity curious autonomous ownership feedback mediation patience diplomacy tact integrity honesty ethics ethic respect inclusive ' +
    'inclusivity networking rapport delegation motivation motivating inspiring guidance writing'
  ).split(/\s+/).filter(Boolean));

  /* ---------- methodologies / processes ---------- */

  const METHODS = new Set((
    'agile agility scrum kanban waterfall lean devops tdd bdd sprint sprints retrospective retrospectives standup standups kaizen itil xp'
  ).split(/\s+/).filter(Boolean));

  /* ---------- multi-word phrases (matched on squashed text) ---------- */

  /* ---------- semantic matching: synonym groups ---------- */

  // Terms a recruiter treats as equivalent. Matching is synonym-aware:
  // a JD keyword counts as covered when any equivalent term appears in
  // the resume ("Kubernetes" satisfies a JD asking for "k8s", etc.).
  const SYNONYM_GROUPS = [
    ['javascript', 'js'],
    ['typescript', 'ts'],
    ['python', 'py'],
    ['react', 'reactjs'],
    ['angular', 'angularjs'],
    ['vue', 'vuejs'],
    ['node', 'nodejs'],
    ['kubernetes', 'k8s'],
    ['postgresql', 'postgres'],
    ['mongodb', 'mongo'],
    ['amazon web services', 'aws'],
    ['google cloud platform', 'google cloud', 'gcp'],
    ['microsoft azure', 'azure'],
    ['continuous integration', 'continuous delivery', 'ci cd', 'cicd'],
    ['rest', 'restful'],
    ['machine learning', 'ml'],
    ['artificial intelligence', 'ai'],
    ['version control', 'source control'],
    ['html', 'html5'],
    ['css', 'css3'],
    ['unit testing', 'unit tests']
  ];

  // normalized token -> Set of normalized equivalents
  const SYNONYM_OF = new Map();
  for (const group of SYNONYM_GROUPS) {
    const norms = [...new Set(group.map(normalize))].filter(Boolean);
    for (const n of norms) {
      if (!SYNONYM_OF.has(n)) SYNONYM_OF.set(n, new Set());
      for (const m of norms) if (m !== n) SYNONYM_OF.get(n).add(m);
    }
  }

  /* ---------- gap categories: tools & platforms vs hard skills ---------- */

  const TOOLS = new Set((
    'aws azure gcp docker kubernetes k8s terraform ansible puppet chef jenkins bamboo circleci travisci ' +
    'githubactions gitlabci cicd git github gitlab bitbucket jira confluence trello asana slack figma sketch ' +
    'adobexd zeplin webpack vite rollup parcel npm yarn pnpm pip maven gradle linux unix bash shell zsh ' +
    'powershell nginx apache iis lighttpd cloudfront s3 ec2 ecs eks lambda rds dynamodb firebase firestore ' +
    'heroku vercel netlify grafana prometheus datadog splunk kafka rabbitmq redis memcached elasticsearch ' +
    'postgres postgresql mysql mariadb sqlite mongodb mongo cassandra couchdb influxdb'
  ).split(' '));

  // Multi-word skill domains (matched as phrases) that count as hard skills.
  const TECH_DOMAINS = new Set([
    'machine learning', 'deep learning', 'data science', 'data analysis', 'data analytics',
    'data engineering', 'data visualization', 'artificial intelligence', 'business intelligence',
    'cloud computing', 'mobile development', 'full stack', 'devops', 'site reliability engineering',
    'quality assurance', 'embedded systems', 'computer vision', 'natural language processing',
    'cybersecurity', 'information security', 'network engineering', 'database administration',
    'systems administration', 'technical support', 'product management', 'project management',
    'business analysis', 'data warehousing', 'big data', 'microservices', 'serverless',
    'api design', 'system design', 'software architecture', 'domain driven design',
    'test driven development', 'behavior driven development', 'continuous integration',
    'continuous delivery', 'infrastructure as code', 'platform engineering', 'developer experience',
    'observability', 'distributed systems', 'high availability', 'performance tuning',
    'load testing', 'security compliance', 'cloud architecture', 'solutions architecture'
  ].map(normalize));

  const PHRASES = [
    ['machine learning', 'Machine Learning'],
    ['deep learning', 'Deep Learning'],
    ['data science', 'Data Science'],
    ['data analysis', 'Data Analysis'],
    ['data analytics', 'Data Analytics'],
    ['data engineering', 'Data Engineering'],
    ['data visualization', 'Data Visualization'],
    ['data warehouse', 'Data Warehouse'],
    ['data pipeline', 'Data Pipeline'],
    ['data pipelines', 'Data Pipelines'],
    ['data modeling', 'Data Modeling'],
    ['data governance', 'Data Governance'],
    ['artificial intelligence', 'Artificial Intelligence'],
    ['natural language processing', 'Natural Language Processing'],
    ['computer vision', 'Computer Vision'],
    ['neural network', 'Neural Networks'],
    ['neural networks', 'Neural Networks'],
    ['speech recognition', 'Speech Recognition'],
    ['recommendation system', 'Recommendation Systems'],
    ['recommendation systems', 'Recommendation Systems'],
    ['project management', 'Project Management'],
    ['product management', 'Product Management'],
    ['program management', 'Program Management'],
    ['product owner', 'Product Owner'],
    ['scrum master', 'Scrum Master'],
    ['business analysis', 'Business Analysis'],
    ['business intelligence', 'Business Intelligence'],
    ['business development', 'Business Development'],
    ['quality assurance', 'Quality Assurance'],
    ['quality control', 'Quality Control'],
    ['lean manufacturing', 'Lean Manufacturing'],
    ['six sigma', 'Six Sigma'],
    ['supply chain', 'Supply Chain'],
    ['customer service', 'Customer Service'],
    ['customer support', 'Customer Support'],
    ['customer success', 'Customer Success'],
    ['technical support', 'Technical Support'],
    ['help desk', 'Help Desk'],
    ['service desk', 'Service Desk'],
    ['it support', 'IT Support'],
    ['mobile development', 'Mobile Development'],
    ['full stack', 'Full Stack'],
    ['front end', 'Front End'],
    ['back end', 'Back End'],
    ['user experience', 'User Experience'],
    ['user interface', 'User Interface'],
    ['ux design', 'UX Design'],
    ['ui design', 'UI Design'],
    ['ux research', 'UX Research'],
    ['graphic design', 'Graphic Design'],
    ['web design', 'Web Design'],
    ['design system', 'Design System'],
    ['design systems', 'Design Systems'],
    ['component library', 'Component Library'],
    ['content management', 'Content Management'],
    ['content marketing', 'Content Marketing'],
    ['digital marketing', 'Digital Marketing'],
    ['search engine optimization', 'Search Engine Optimization'],
    ['search engine marketing', 'Search Engine Marketing'],
    ['social media', 'Social Media'],
    ['social media marketing', 'Social Media Marketing'],
    ['email marketing', 'Email Marketing'],
    ['pay per click', 'Pay-Per-Click'],
    ['google analytics', 'Google Analytics'],
    ['human resources', 'Human Resources'],
    ['talent acquisition', 'Talent Acquisition'],
    ['performance management', 'Performance Management'],
    ['change management', 'Change Management'],
    ['risk management', 'Risk Management'],
    ['incident management', 'Incident Management'],
    ['release management', 'Release Management'],
    ['configuration management', 'Configuration Management'],
    ['asset management', 'Asset Management'],
    ['identity management', 'Identity Management'],
    ['financial analysis', 'Financial Analysis'],
    ['financial reporting', 'Financial Reporting'],
    ['market research', 'Market Research'],
    ['competitive analysis', 'Competitive Analysis'],
    ['brand management', 'Brand Management'],
    ['account management', 'Account Management'],
    ['sales operations', 'Sales Operations'],
    ['inventory management', 'Inventory Management'],
    ['vendor management', 'Vendor Management'],
    ['contract negotiation', 'Contract Negotiation'],
    ['continuous integration', 'Continuous Integration'],
    ['continuous delivery', 'Continuous Delivery'],
    ['continuous deployment', 'Continuous Deployment'],
    ['continuous improvement', 'Continuous Improvement'],
    ['test driven development', 'Test-Driven Development'],
    ['behavior driven development', 'Behavior-Driven Development'],
    ['test automation', 'Test Automation'],
    ['version control', 'Version Control'],
    ['source control', 'Source Control'],
    ['code review', 'Code Review'],
    ['code reviews', 'Code Reviews'],
    ['pair programming', 'Pair Programming'],
    ['object oriented', 'Object-Oriented'],
    ['systems design', 'Systems Design'],
    ['system design', 'System Design'],
    ['design patterns', 'Design Patterns'],
    ['domain driven', 'Domain-Driven Design'],
    ['event driven', 'Event-Driven Architecture'],
    ['cloud computing', 'Cloud Computing'],
    ['cloud infrastructure', 'Cloud Infrastructure'],
    ['cloud security', 'Cloud Security'],
    ['application security', 'Application Security'],
    ['network security', 'Network Security'],
    ['security operations', 'Security Operations'],
    ['secure coding', 'Secure Coding'],
    ['threat intelligence', 'Threat Intelligence'],
    ['vulnerability management', 'Vulnerability Management'],
    ['patch management', 'Patch Management'],
    ['data encryption', 'Data Encryption'],
    ['key management', 'Key Management'],
    ['secrets management', 'Secrets Management'],
    ['backup and recovery', 'Backup and Recovery'],
    ['data backup', 'Data Backup'],
    ['disaster recovery', 'Disaster Recovery'],
    ['business continuity', 'Business Continuity'],
    ['high availability', 'High Availability'],
    ['fault tolerance', 'Fault Tolerance'],
    ['load balancing', 'Load Balancing'],
    ['auto scaling', 'Auto Scaling'],
    ['blue green', 'Blue-Green Deployment'],
    ['canary deployment', 'Canary Deployment'],
    ['feature flag', 'Feature Flags'],
    ['technical debt', 'Technical Debt'],
    ['legacy system', 'Legacy Systems'],
    ['legacy systems', 'Legacy Systems'],
    ['capacity planning', 'Capacity Planning'],
    ['site reliability', 'Site Reliability'],
    ['it infrastructure', 'IT Infrastructure'],
    ['network administration', 'Network Administration'],
    ['database administration', 'Database Administration'],
    ['system administration', 'System Administration'],
    ['information security', 'Information Security'],
    ['cyber security', 'Cyber Security'],
    ['zero trust', 'Zero Trust'],
    ['regulatory compliance', 'Regulatory Compliance'],
    ['risk assessment', 'Risk Assessment'],
    ['key performance indicators', 'Key Performance Indicators'],
    ['standard operating procedures', 'Standard Operating Procedures'],
    ['root cause analysis', 'Root Cause Analysis'],
    ['process improvement', 'Process Improvement'],
    ['business process', 'Business Process'],
    ['workflow management', 'Workflow Management'],
    ['cross functional', 'Cross-Functional'],
    ['cross functional teams', 'Cross-Functional Teams'],
    ['end to end', 'End-to-End'],
    ['best practices', 'Best Practices'],
    ['time management', 'Time Management'],
    ['stress management', 'Stress Management'],
    ['critical thinking', 'Critical Thinking'],
    ['problem solving', 'Problem Solving'],
    ['decision making', 'Decision Making'],
    ['written communication', 'Written Communication'],
    ['verbal communication', 'Verbal Communication'],
    ['active listening', 'Active Listening'],
    ['public speaking', 'Public Speaking'],
    ['presentation skills', 'Presentation Skills'],
    ['interpersonal skills', 'Interpersonal Skills'],
    ['leadership skills', 'Leadership Skills'],
    ['negotiation skills', 'Negotiation Skills'],
    ['conflict resolution', 'Conflict Resolution'],
    ['stakeholder management', 'Stakeholder Management'],
    ['budget management', 'Budget Management'],
    ['resource allocation', 'Resource Allocation'],
    ['strategic planning', 'Strategic Planning'],
    ['attention to detail', 'Attention to Detail'],
    ['work ethic', 'Work Ethic'],
    ['self motivated', 'Self-Motivated'],
    ['fast learner', 'Fast Learner'],
    ['quick learner', 'Quick Learner'],
    ['growth mindset', 'Growth Mindset'],
    ['lifelong learning', 'Lifelong Learning'],
    ['customer focused', 'Customer-Focused'],
    ['client focused', 'Client-Focused'],
    ['people skills', 'People Skills'],
    ['team player', 'Team Player'],
    ['positive attitude', 'Positive Attitude'],
    ['emotional intelligence', 'Emotional Intelligence'],
    ['open minded', 'Open-Minded'],
    ['constructive feedback', 'Constructive Feedback'],
    ['research and development', 'Research & Development'],
    ['product development', 'Product Development'],
    ['product launch', 'Product Launch'],
    ['product market fit', 'Product-Market Fit'],
    ['go to market', 'Go-to-Market'],
    ['growth hacking', 'Growth Hacking'],
    ['conversion optimization', 'Conversion Optimization'],
    ['customer experience', 'Customer Experience'],
    ['user research', 'User Research'],
    ['a b testing', 'A/B Testing'],
    ['a b test', 'A/B Test'],
    ['open source', 'Open Source'],
    ['stand up', 'Stand-Ups'],
    ['stand ups', 'Stand-Ups'],
    ['real estate', 'Real Estate'],
    ['computer science', 'Computer Science'],
    ['computer engineering', 'Computer Engineering'],
    ['information technology', 'Information Technology'],
    ['electrical engineering', 'Electrical Engineering'],
    ['mechanical engineering', 'Mechanical Engineering'],
    ['civil engineering', 'Civil Engineering'],
    ['systems engineering', 'Systems Engineering'],
    ['life sciences', 'Life Sciences'],
    ['subject matter expert', 'Subject Matter Expert'],
    ['extreme programming', 'Extreme Programming'],
    ['scaled agile', 'Scaled Agile'],
    ['mean stack', 'MEAN Stack'],
    ['mern stack', 'MERN Stack'],
    ['performance optimization', 'Performance Optimization'],
    ['performance tuning', 'Performance Tuning']
  ];

  /* ---------- tokenization ---------- */

  function tokenize(text) {
    const raw = String(text)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9+#./\-\s]/g, ' ')
      .split(/\s+/);
    const out = [];
    for (let t of raw) {
      t = t.replace(/^[.#\-/]+|[.#\-/]+$/g, '');
      if (t.length < 2 || t.length > 24) continue;
      if (STOPWORDS.has(t)) continue;
      out.push(t);
    }
    return out;
  }

  // Find the keyword as it was originally cased in the source text.
  function findDisplay(text, raw) {
    try {
      const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(?<![a-z0-9+#-])' + esc + '(?![a-z0-9+#-])', 'i');
      const m = String(text).match(re);
      if (m) return m[0];
    } catch (e) { /* fall through to raw */ }
    return raw;
  }

  /* ---------- keyword extraction ---------- */

  // Count whole-phrase occurrences in squashed text (word-boundary aware,
  // so "design system" does not count inside "design systems").
  const countPhrase = (hay, needle) => {
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|\\s)' + esc + '(?=\\s|$)', 'g');
    const m = hay.match(re);
    return m ? m.length : 0;
  };

  function extractKeywords(jdText) {
    const jdSq = squash(jdText);
    const tokens = tokenize(jdText);

    // Unigram frequencies
    const freq = new Map(); // norm -> { raw, count }
    for (const t of tokens) {
      const n = normalize(t);
      if (!n || /^\d+$/.test(n)) continue;
      if (inSet(NOISE, n)) continue;
      if (n.length < 3 && !inSet(TECH, n)) continue;
      const e = freq.get(n) || { raw: t, count: 0 };
      e.count += 1;
      freq.set(n, e);
    }

    // Multi-word phrases found in the JD
    let foundPhrases = [];
    for (const [m, d] of PHRASES) {
      if (jdSq.includes(m)) {
        const count = Math.max(1, countPhrase(jdSq, m));
        foundPhrases.push({ norm: m, display: d, count, weight: 2.6 * count, isPhrase: true });
      }
    }
    // If two found phrases overlap ("design system" inside "design systems"),
    // keep only the more specific one.
    foundPhrases = foundPhrases.filter((p) =>
      !foundPhrases.some((q) => q !== p && q.norm.length > p.norm.length && q.norm.includes(p.norm))
    );

    // How many times each word appears inside a found phrase
    const phraseWordCounts = new Map();
    for (const p of foundPhrases) {
      for (const w of p.norm.split(' ')) {
        phraseWordCounts.set(w, (phraseWordCounts.get(w) || 0) + p.count);
      }
    }
    // Normalized forms of whole phrases ("cross functional" -> "crossfunctional"),
    // so hyphenated unigrams like "cross-functional" don't duplicate the phrase.
    const phraseNorms = new Set(foundPhrases.map((p) => normalize(p.norm)));

    const keywords = [];
    for (const [n, e] of freq) {
      // Drop unigrams whose only occurrences are inside a found phrase
      // (e.g. "machine" / "learning" when "machine learning" is already a keyword),
      // unless the word is independently meaningful.
      if (phraseWordCounts.has(n) && !inSet(TECH, n) && !inSet(SOFT, n) && !inSet(METHODS, n)) {
        if (e.count <= phraseWordCounts.get(n)) continue;
      }
      // Drop unigrams that are just the hyphenated form of a found phrase.
      if (phraseNorms.has(n) && !inSet(TECH, n) && !inSet(SOFT, n) && !inSet(METHODS, n)) {
        continue;
      }
      const display = findDisplay(jdText, e.raw);
      // Skip likely proper nouns (company / product names such as "Relay"):
      // capitalized, not an acronym, and not a known skill term.
      if (!inSet(TECH, n) && !inSet(SOFT, n) && !inSet(METHODS, n) && /^[A-Z][a-z]/.test(display)) {
        continue;
      }
      let w = e.count;
      if (inSet(TECH, n)) w *= 2.2;
      else if (inSet(METHODS, n)) w *= 1.6;
      else if (inSet(SOFT, n)) w *= 1.3;
      if (/\d/.test(n)) w *= 1.2;
      keywords.push({ norm: n, raw: e.raw, display, count: e.count, weight: w, isPhrase: false });
    }
    for (const p of foundPhrases) keywords.push(p);

    keywords.sort((a, b) => b.weight - a.weight || a.display.localeCompare(b.display));
    return keywords.slice(0, 60);
  }

  /* ---------- presence checks ---------- */

  function buildResumeContext(resumeText) {
    const tokens = tokenize(resumeText);
    const normArr = tokens.map(normalize).filter(Boolean);
    const normSet = new Set(normArr);
    const stemSet = new Set(normArr.map(stem));
    // Semantic expansion: every known equivalent of each resume term is
    // added, so "k8s" in a resume satisfies a JD keyword "Kubernetes".
    const expanded = new Set(normSet);
    for (const n of normSet) {
      const equivalents = SYNONYM_OF.get(n);
      if (equivalents) for (const m of equivalents) expanded.add(m);
    }
    return { squashed: squash(resumeText), normArr, normSet, stemSet, expanded };
  }

  function unigramPresent(n, ctx) {
    for (const f of forms(n)) {
      if (ctx.expanded.has(f)) return true;
      if (ctx.stemSet.has(stem(f))) return true;
      if (f.length >= 3) {
        for (const t of ctx.normArr) {
          if (t.length > f.length && (t.startsWith(f) || t.endsWith(f))) return true;
        }
      }
    }
    return false;
  }

  function phrasePresent(kw, ctx) {
    if (ctx.squashed.includes(kw.norm)) return true;
    // Synonym-aware phrase check: the JD phrase "machine learning" is
    // satisfied by "ml" in the resume (word-boundary aware).
    const equivalents = SYNONYM_OF.get(normalize(kw.norm));
    if (equivalents) {
      for (const v of equivalents) {
        if (countPhrase(ctx.squashed, v) > 0) return true;
      }
    }
    const words = kw.norm.split(' ');
    return words.every((w) => {
      if (w.length < 3) return true;
      return unigramPresent(w, ctx);
    });
  }

  /* ---------- main analysis ---------- */

  function analyze(resumeText, jdText) {
    const ctx = buildResumeContext(resumeText);
    const keywords = extractKeywords(jdText);

    const matched = [];
    const missing = [];
    for (const kw of keywords) {
      const present = kw.isPhrase ? phrasePresent(kw, ctx) : unigramPresent(kw.norm, ctx);
      (present ? matched : missing).push(kw);
    }

    const totalWeight = keywords.reduce((s, k) => s + k.weight, 0);
    const matchedWeight = matched.reduce((s, k) => s + k.weight, 0);
    const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

    return {
      score,
      matched,
      missing,
      matchedCount: matched.length,
      totalKeywords: keywords.length
    };
  }

  /* ---------- line-by-line JD gap analysis ---------- */

  // JD lines that are boilerplate rather than requirements.
  const BOILERPLATE = /^(about (us|the (company|team|role))|our (benefits|culture|team|mission|vision|company)|what (you|we) (will|do|offer|provide)|nice to have|perks and benefits|benefits|equal opportunity|we are an|apply (now|today)|how to apply|who (you|we) are|the role$|responsibilities$|requirements$|qualifications$|what you (will|bring|need)|your role|the ideal candidate|join (us|our team)|salary|compensation|location|visa|sponsor|relocation|we offer|we're looking|we are looking|the company)/i;

  // A JD line counts as a requirement when it is a substantial,
  // non-boilerplate line (bullets included, markers stripped).
  function analyzeRequirements(jdText, resumeText) {
    const ctx = buildResumeContext(resumeText);
    const requirements = [];

    String(jdText).split(/\r?\n/).forEach((raw) => {
      let line = raw.trim();
      if (!line) return;
      line = line.replace(/^(•|\*|·|‣|-|–|—|\d+[.)])\s+/, '');
      if (line.length < 24 || line.length > 400) return;
      if (BOILERPLATE.test(line)) return;

      const kws = extractKeywords(line);
      if (!kws.length) return;

      const missing = kws.filter((k) =>
        k.isPhrase ? !phrasePresent(k, ctx) : !unigramPresent(k.norm, ctx)
      );
      const status = missing.length === 0
        ? 'covered'
        : (missing.length <= Math.max(1, Math.ceil(kws.length / 2)) ? 'partial' : 'gap');

      requirements.push({ line, keywords: kws, missing, status });
    });

    const summary = {
      total: requirements.length,
      covered: requirements.filter((r) => r.status === 'covered').length,
      partial: requirements.filter((r) => r.status === 'partial').length,
      gap: requirements.filter((r) => r.status === 'gap').length
    };
    return { requirements, summary };
  }

  /* ---------- resume parsing (sections, header, bullets) ---------- */

  // Known heading variants -> canonical ATS-friendly heading.
  const HEADING_ALIASES = {
    'summary': 'PROFESSIONAL SUMMARY', 'professional summary': 'PROFESSIONAL SUMMARY',
    'profile': 'PROFESSIONAL SUMMARY', 'professional profile': 'PROFESSIONAL SUMMARY',
    'objective': 'PROFESSIONAL SUMMARY', 'career objective': 'PROFESSIONAL SUMMARY',
    'about': 'PROFESSIONAL SUMMARY', 'about me': 'PROFESSIONAL SUMMARY',
    'work experience': 'WORK EXPERIENCE', 'professional experience': 'WORK EXPERIENCE',
    'experience': 'WORK EXPERIENCE', 'employment history': 'WORK EXPERIENCE',
    'work history': 'WORK EXPERIENCE', 'career history': 'WORK EXPERIENCE',
    'skills': 'SKILLS', 'technical skills': 'SKILLS', 'core skills': 'SKILLS',
    'core competencies': 'SKILLS', 'competencies': 'SKILLS', 'technologies': 'SKILLS',
    'tech stack': 'SKILLS', 'technical proficiencies': 'SKILLS', 'key skills': 'SKILLS',
    'technical expertise': 'SKILLS', 'areas of expertise': 'SKILLS', 'expertise': 'SKILLS',
    'education': 'EDUCATION', 'education & training': 'EDUCATION',
    'education and training': 'EDUCATION', 'academic background': 'EDUCATION',
    'academic qualifications': 'EDUCATION', 'qualifications': 'EDUCATION',
    'certifications': 'CERTIFICATIONS', 'certificates': 'CERTIFICATIONS',
    'licenses': 'CERTIFICATIONS', 'licenses & certifications': 'CERTIFICATIONS',
    'certifications & licenses': 'CERTIFICATIONS', 'certifications and licenses': 'CERTIFICATIONS',
    'projects': 'PROJECTS', 'personal projects': 'PROJECTS', 'selected projects': 'PROJECTS',
    'key projects': 'PROJECTS', 'portfolio': 'PROJECTS',
    'awards': 'AWARDS & HONORS', 'honors': 'AWARDS & HONORS', 'achievements': 'AWARDS & HONORS',
    'accomplishments': 'AWARDS & HONORS', 'awards & honors': 'AWARDS & HONORS',
    'awards and honors': 'AWARDS & HONORS',
    'volunteer experience': 'VOLUNTEER EXPERIENCE', 'volunteering': 'VOLUNTEER EXPERIENCE',
    'community involvement': 'VOLUNTEER EXPERIENCE', 'volunteer work': 'VOLUNTEER EXPERIENCE',
    'publications': 'PUBLICATIONS', 'papers': 'PUBLICATIONS', 'research': 'PUBLICATIONS',
    'languages': 'LANGUAGES', 'interests': 'INTERESTS', 'hobbies': 'INTERESTS',
    'references': 'REFERENCES', 'contact': 'CONTACT', 'contact information': 'CONTACT',
    'professional highlights': 'PROFESSIONAL HIGHLIGHTS', 'highlights': 'PROFESSIONAL HIGHLIGHTS',
    'career highlights': 'PROFESSIONAL HIGHLIGHTS', 'key achievements': 'PROFESSIONAL HIGHLIGHTS',
    'additional information': 'ADDITIONAL INFORMATION', 'additional info': 'ADDITIONAL INFORMATION'
  };

  function normalizeHeading(raw) {
    const key = String(raw).toLowerCase().replace(/[•:*\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    return HEADING_ALIASES[key] || null;
  }

  // Unknown ALL-CAPS short line ("TECHNICAL EXPERTISE") — a heading only
  // when it follows a blank line and the header block is already closed,
  // so a capitalized name on line one is never mistaken for a heading.
  function detectCapsHeading(line) {
    const t = line.replace(/[:.]+$/, '').trim();
    if (t.length < 3 || t.length > 38) return false;
    if (!/^[A-Z0-9][A-Z0-9 &/'()-]*$/.test(t)) return false;
    if (!/\s/.test(t)) return false; // single-word caps are handled by aliases
    return t.toUpperCase();
  }

  const BULLET_RE = /^(•|\*|·|‣|-|–|—|\d+[.)])\s+/;

  function parseResume(text) {
    const rawLines = String(text).split(/\r?\n/);
    const header = [];
    const sections = [];
    let current = null;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;

      const alias = normalizeHeading(line);
      const prevBlank = i === 0 || rawLines[i - 1].trim() === '';
      const caps = alias ? null : detectCapsHeading(line);
      const isHeading = alias || (caps && prevBlank && header.length > 0);

      if (isHeading) {
        current = { heading: alias || caps, lines: [] };
        sections.push(current);
        continue;
      }
      if (sections.length === 0) {
        header.push(line);
        continue;
      }
      if (current) current.lines.push(line);
    }

    const parsedSections = sections.map((s) => {
      const plain = [];
      const bullets = [];
      for (const l of s.lines) {
        if (BULLET_RE.test(l)) bullets.push(l.replace(BULLET_RE, '').trim());
        else plain.push(l);
      }
      return { heading: s.heading, lines: plain, bullets };
    });

    const bullets = [];
    parsedSections.forEach((s, sectionIndex) => {
      s.bullets.forEach((text2, bulletIndex) => {
        bullets.push({ text: text2, sectionIndex, bulletIndex, section: s.heading });
      });
    });

    return {
      header,
      name: header[0] || '',
      contact: header.slice(1),
      sections: parsedSections,
      bullets
    };
  }

  /* ---------- categorization ---------- */

  // Buckets used for the visual gap indicators:
  //   hard-skill (languages, frameworks, libraries)
  //   tool       (platforms, CI/CD, dev tools, databases)
  //   soft       (communication, leadership, ...)
  //   method     (agile, scrum, tdd, ...)
  //   core       (anything else)
  function categorize(kw) {
    if (kw.isPhrase) {
      if (TECH_DOMAINS.has(normalize(kw.norm))) return 'hard-skill';
      const words = kw.norm.split(' ');
      if (words.some((w) => inSet(TOOLS, w))) return 'tool';
      if (words.some((w) => inSet(TECH, w))) return 'hard-skill';
      if (words.some((w) => inSet(SOFT, w))) return 'soft';
      if (words.some((w) => inSet(METHODS, w))) return 'method';
      return 'core';
    }
    if (inSet(TOOLS, kw.norm)) return 'tool';
    if (inSet(TECH, kw.norm)) return 'hard-skill';
    if (inSet(SOFT, kw.norm)) return 'soft';
    if (inSet(METHODS, kw.norm)) return 'method';
    return 'core';
  }

  /* ---------- score label ---------- */

  function scoreLabel(score) {
    if (score >= 80) {
      return { text: 'Excellent match', tone: 'great', desc: 'Your resume already speaks the job description\u2019s language. You\u2019re ready to apply.' };
    }
    if (score >= 60) {
      return { text: 'Strong match', tone: 'good', desc: 'You cover most of the important terms \u2014 close the remaining gaps below before applying.' };
    }
    if (score >= 40) {
      return { text: 'Partial match', tone: 'ok', desc: 'Several critical keywords are missing. Add them to your resume before you apply.' };
    }
    return { text: 'Low match', tone: 'low', desc: 'Significant tailoring needed \u2014 focus on the missing keywords below.' };
  }

  /* ---------- advice builder ---------- */

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function buildAdvice(missing) {
    const groups = { 'hard-skill': [], tool: [], soft: [], method: [], core: [] };
    for (const kw of missing) {
      const bucket = groups[categorize(kw)];
      if (bucket) bucket.push(kw);
    }

    const bullets = [];
    const names = (arr, max) => arr.slice(0, max).map((k) => k.display);
    const join = (arr, max) => names(arr, max).map(escapeHtml).join(', ');

    const skills = groups['hard-skill'].concat(groups.tool);
    if (skills.length) {
      bullets.push({
        icon: 'wrench',
        html: 'Add a <strong>Skills</strong> or <strong>Technical Skills</strong> section near the top of your resume and list <strong>' +
          join(skills, 6) + '</strong> \u2014 use the exact spellings from the job posting.'
      });
    }
    if (groups.method.length) {
      bullets.push({
        icon: 'loop',
        html: 'Name the methodology where you actually used it \u2014 for example: \u201cDelivered features in <strong>' +
          escapeHtml(names(groups.method, 1)[0]) + '</strong> sprints with daily stand-ups and retrospectives.\u201d'
      });
    }
    if (groups.soft.length) {
      bullets.push({
        icon: 'users',
        html: 'Weave <strong>' + join(groups.soft, 4) + '</strong> into your professional summary, e.g. \u201cA collaborative problem-solver with strong ' +
          escapeHtml(names(groups.soft, 1)[0]) + ' skills.\u201d'
      });
    }
    if (groups.core.length) {
      // Prefer a plain keyword over a phrase for the "inject into a bullet" advice.
      const corePick = groups.core.find((k) => !k.isPhrase) || groups.core[0];
      const c = escapeHtml(corePick.display);
      bullets.push({
        icon: 'target',
        html: 'Rewrite your most relevant achievement bullet to include <strong>' + c + '</strong> and attach a number: \u201cBuilt X using ' + c +
          ', improving Y by Z%.\u201d'
      });
    }
    if (missing.length) {
      bullets.push({
        icon: 'copy',
        html: 'Mirror the job description\u2019s exact wording. Many employers use applicant tracking systems (ATS) that filter by literal keywords like <strong>\u201c' +
          escapeHtml(missing[0].display) + '\u201d</strong> \u2014 copy phrases verbatim wherever they are true for you.'
      });
      if (missing.length > 6) {
        bullets.push({
          icon: 'list',
          html: 'Work through the checklist above in order \u2014 it is ranked by importance. Covering the top ' +
            Math.min(missing.length, 10) + ' missing terms dramatically raises your odds of passing the ATS screen.'
        });
      }
    } else {
      bullets.push({
        icon: 'check',
        html: 'You are covering every critical keyword we detected. Reorder your bullets so the most relevant achievements appear first, and make sure every claim is backed by a number.'
      });
    }
    return bullets;
  }

  return {
    analyze,
    extractKeywords,
    tokenize,
    buildAdvice,
    scoreLabel,
    categorize,
    analyzeRequirements,
    parseResume,
    normalizeHeading
  };
});
