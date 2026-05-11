"use strict";
/**
 * Domain Taxonomy — explicit architectural domain classification.
 * Includes positive keywords, negative examples, and exclusion rules
 * to prevent misclassification of resilience/infra patterns as security.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_DOMAINS = void 0;
exports.classifyDomains = classifyDomains;
exports.getEffectiveRisk = getEffectiveRisk;
// ── Domain definitions ────────────────────────────────────────────────────────
const SECURITY = {
    id: 'security',
    displayName: 'Security',
    description: 'Authentication bypass, injection attacks, encryption, TLS, secret management, access control',
    keywords: [
        'xss', 'csrf', 'injection', 'sql injection', 'sanitize', 'sanitization',
        'encrypt', 'encryption', 'decrypt', 'tls', 'ssl', 'https', 'http enforcement',
        'secret', 'secrets management', 'vault', 'cors', 'csp', 'content security policy',
        'access control', 'authorization bypass', 'privilege escalation',
        'vulnerability', 'cve', 'penetration', 'pentest', 'owasp',
        'input validation', 'output encoding', 'clickjacking',
        'hsts', 'certificate', 'public key', 'private key', 'signature',
    ],
    negativeExamples: [
        'circuit breaker', // → resilience
        'bulkhead', // → resilience
        'retry', // → resilience
        'backoff', // → resilience
        'fallback', // → resilience
        'rate limiting', // → resilience (when standalone)
        'throttle', // → resilience
        'shed load', // → resilience
        'jitter', // → resilience
        'half-open', // → resilience
        'probe', // → resilience
        'timeout', // → resilience (when standalone, not TLS timeout)
        'health check', // → infrastructure
        'middleware chain', // → infrastructure
    ],
    exclusionTerms: [
        'circuit', 'bulkhead', 'half-open', 'backoff', 'jitter',
        'coalesce', 'shed', 'fallback', 'retry',
    ],
    relatedDomains: ['auth', 'api', 'payment'],
    baseRisk: 'high',
};
const RESILIENCE = {
    id: 'resilience',
    displayName: 'Resilience',
    description: 'Circuit breakers, bulkheads, retry, backoff, fallback, timeout, half-open, shed load, hedged requests',
    keywords: [
        'circuit breaker', 'circuit', 'breaker',
        'bulkhead',
        'retry', 'retries', 'retry logic', 'retry policy',
        'backoff', 'exponential backoff', 'linear backoff',
        'fallback', 'fallback handler',
        'timeout', 'deadline', 'deadline propagation',
        'half-open', 'half open',
        'probe', 'single probe', 'probing',
        'coalesce', 'request coalescing', 'coalescer',
        'throttle', 'throttling',
        'shed load', 'load shedding',
        'jitter',
        'hedged request', 'hedging',
        'rate limiting', 'rate limit',
        'resilience', 'fault tolerance', 'fault tolerant',
        'graceful degradation', 'degradation',
        'bulkhead isolation', 'isolation',
        'open state', 'closed state',
    ],
    negativeExamples: [
        'authentication', // → auth/security
        'authorization', // → auth/security
        'sql', // → data-access
        'xss', // → security
        'csrf', // → security
    ],
    exclusionTerms: [],
    relatedDomains: ['infrastructure', 'observability', 'concurrency'],
    baseRisk: 'low',
};
const INFRASTRUCTURE = {
    id: 'infrastructure',
    displayName: 'Infrastructure',
    description: 'Middleware, proxy, gateway, load balancer, Kubernetes, Docker, deployments, service mesh, health checks',
    keywords: [
        'middleware', 'proxy', 'reverse proxy',
        'gateway', 'api gateway',
        'load balancer', 'load balancing',
        'kubernetes', 'k8s', 'helm', 'kustomize',
        'docker', 'dockerfile', 'container', 'containerize',
        'deployment', 'deploy', 'release', 'rollout', 'rollback',
        'service mesh', 'sidecar', 'envoy', 'istio', 'linkerd',
        'ingress', 'egress', 'traffic shaping',
        'health check', 'liveness', 'readiness', 'startup probe',
        'config', 'configuration', 'config validation',
        'graceful shutdown', 'drain', 'termination',
        'terraform', 'pulumi', 'cloudformation',
        'ci/cd', 'pipeline', 'artifact', 'registry',
        'namespace', 'cluster',
    ],
    negativeExamples: [
        'sql injection', // → security
        'middleware auth', // → auth (auth middleware specifically)
    ],
    exclusionTerms: [],
    relatedDomains: ['resilience', 'observability', 'concurrency'],
    baseRisk: 'low',
};
const API = {
    id: 'api',
    displayName: 'API',
    description: 'REST, GraphQL, tRPC, gRPC, endpoints, routes, handlers, webhooks, HTTP request/response',
    keywords: [
        'rest', 'restful', 'rest api',
        'graphql', 'resolver', 'schema stitching',
        'trpc', 'grpc', 'protobuf',
        'endpoint', 'endpoints',
        'route', 'routing', 'router',
        'handler', 'request handler',
        'controller',
        'webhook', 'webhook signature',
        'http', 'https', 'http/2', 'http/3',
        'request', 'response',
        'openapi', 'swagger',
        'api versioning', 'versioning',
        'pagination', 'cursor',
        'status code',
    ],
    negativeExamples: [
        'sql injection', // → security
        'db query', // → data-access
    ],
    exclusionTerms: [],
    relatedDomains: ['auth', 'security', 'resilience'],
    baseRisk: 'medium',
};
const CONCURRENCY = {
    id: 'concurrency',
    displayName: 'Concurrency',
    description: 'Async/await, thread pools, worker queues, race conditions, mutexes, semaphores, event loops',
    keywords: [
        'async', 'await', 'async/await',
        'promise', 'promises', 'promise.all', 'promise.allsettled',
        'thread', 'thread pool', 'worker thread',
        'worker', 'web worker', 'service worker',
        'queue drain', 'drain',
        'race condition', 'race',
        'mutex', 'lock', 'locking',
        'semaphore',
        'atomic', 'atomics', 'cas', 'compare-and-swap',
        'deadlock', 'livelock',
        'event loop', 'tick', 'microtask', 'macrotask',
        'goroutine', 'coroutine',
        'asyncio', 'trio', 'curio',
        'abort', 'abort signal', 'abortsignal', 'abortcontroller',
        'cancellation', 'cancel token', 'cancellation token',
        'concurrency', 'concurrent', 'parallelism', 'parallel',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['resilience', 'infrastructure', 'observability'],
    baseRisk: 'medium',
};
const OBSERVABILITY = {
    id: 'observability',
    displayName: 'Observability',
    description: 'Logging, metrics, tracing, spans, OpenTelemetry, Prometheus, Grafana, Datadog, alerts, dashboards',
    keywords: [
        'log', 'logging', 'logger', 'structured logging',
        'metric', 'metrics',
        'trace', 'tracing', 'distributed tracing',
        'span', 'trace context', 'baggage',
        'opentelemetry', 'otel',
        'prometheus',
        'grafana',
        'datadog', 'newrelic', 'dynatrace',
        'alert', 'alerting', 'alert threshold',
        'dashboard',
        'histogram', 'counter', 'gauge', 'summary',
        'health', 'health endpoint',
        'monitoring', 'monitor',
        'sampling', 'sample rate',
        'sli', 'slo', 'sla', 'error budget',
        'p99', 'p95', 'percentile', 'latency',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['infrastructure', 'resilience'],
    baseRisk: 'low',
};
const CACHING = {
    id: 'caching',
    displayName: 'Caching',
    description: 'Cache, Redis, Memcached, TTL, eviction policies, CDN, edge cache, stale-while-revalidate',
    keywords: [
        'cache', 'caching', 'cached',
        'redis',
        'memcached', 'memcache',
        'ttl', 'time-to-live', 'expiry', 'expiration',
        'eviction', 'evict',
        'lru', 'least recently used',
        'lfu', 'least frequently used',
        'cache invalidation', 'invalidate',
        'cache miss', 'cache hit',
        'warm', 'cold start', 'warm cache',
        'stale', 'stale-while-revalidate', 'swr',
        'cdn', 'edge cache', 'cloudfront', 'fastly',
        'cache key', 'cache busting',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['infrastructure', 'api', 'resilience'],
    baseRisk: 'low',
};
const MESSAGING = {
    id: 'messaging',
    displayName: 'Messaging',
    description: 'Message queues, topics, pub/sub, Kafka, RabbitMQ, SQS, SNS, event buses, dead letter queues',
    keywords: [
        'queue', 'message queue',
        'topic',
        'publish', 'subscriber', 'subscribe', 'pubsub', 'pub/sub',
        'consumer', 'producer',
        'kafka', 'confluent',
        'rabbitmq', 'amqp',
        'sqs', 'sns', 'eventbridge',
        'event bus', 'event stream',
        'message broker',
        'dead letter', 'dlq', 'dead letter queue',
        'offset', 'partition', 'consumer group',
        'ack', 'acknowledgement', 'nack',
        'at-least-once', 'exactly-once', 'at-most-once',
        'fanout', 'broadcast',
    ],
    negativeExamples: [
        'notification', // → notification (unless kafka/sqs context)
    ],
    exclusionTerms: [],
    relatedDomains: ['resilience', 'observability', 'infrastructure'],
    baseRisk: 'medium',
};
const DATA_ACCESS = {
    id: 'data-access',
    displayName: 'Data Access',
    description: 'Databases, SQL, ORM, Prisma, migrations, schemas, repositories, connection pools',
    keywords: [
        'database', 'db',
        'sql', 'query', 'queries',
        'orm',
        'prisma',
        'migration', 'migrations',
        'schema',
        'repository', 'data access',
        'crud',
        'transaction', 'txn',
        'connection pool', 'pool',
        'postgres', 'postgresql',
        'mysql', 'mariadb',
        'mongodb', 'mongo',
        'sqlite',
        'dynamodb',
        'index', 'indexing',
        'foreign key', 'constraint',
        'upsert', 'insert', 'update', 'delete', 'select',
    ],
    negativeExamples: [
        'sql injection', // → security
    ],
    exclusionTerms: [],
    relatedDomains: ['auth', 'api', 'resilience'],
    baseRisk: 'medium',
};
const ML_INFERENCE = {
    id: 'ml-inference',
    displayName: 'ML Inference',
    description: 'Model serving, GPU/CUDA, tensors, embeddings, vectors, tokenization, LLM prompts, batch inference',
    keywords: [
        'model', 'model serving', 'model inference',
        'inference', 'infer',
        'gpu', 'cuda', 'cudnn',
        'tensor', 'tensorrt',
        'embedding', 'embeddings',
        'vector', 'vector store', 'vector search',
        'tokenize', 'tokenizer', 'tokenization',
        'prompt', 'completion',
        'llm', 'large language model',
        'batch inference', 'batching',
        'latency sla', 'throughput',
        'onnx', 'onnxruntime',
        'triton', 'torchserve',
        'hugging face', 'transformers',
        'fine-tune', 'fine-tuning',
        'rag', 'retrieval augmented',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['caching', 'observability', 'infrastructure'],
    baseRisk: 'medium',
};
const ORCHESTRATION = {
    id: 'orchestration',
    displayName: 'Orchestration',
    description: 'Workflows, sagas, state machines, step functions, DAGs, pipelines, scheduled tasks, coordinators',
    keywords: [
        'workflow', 'workflows',
        'saga', 'sagas',
        'state machine', 'fsm', 'finite state',
        'step function', 'step functions',
        'dag', 'directed acyclic graph',
        'pipeline', 'pipelines',
        'job', 'jobs',
        'scheduled task', 'cron', 'cron job',
        'coordinator', 'orchestrator',
        'compensating transaction', 'compensation',
        'choreography',
        'temporal', 'cadence', 'prefect', 'airflow',
        'activity', 'workflow definition',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['resilience', 'messaging', 'infrastructure'],
    baseRisk: 'medium',
};
const AUTH = {
    id: 'auth',
    displayName: 'Auth',
    description: 'Authentication, authorization, JWT, tokens, sessions, OAuth, RBAC, permissions, credentials',
    keywords: [
        'authentication', 'authenticate',
        'authorization', 'authorize',
        'jwt', 'json web token',
        'token', 'bearer token', 'access token', 'refresh token',
        'session', 'session management',
        'oauth', 'oauth2', 'oidc', 'openid connect',
        'rbac', 'role-based access control',
        'permission', 'permissions',
        'role', 'roles',
        'credential', 'credentials',
        'login', 'logout', 'sign in', 'sign out',
        'sso', 'single sign-on', 'saml',
        'mfa', '2fa', 'multi-factor',
        'password', 'password hash',
        'api key', 'api secret',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['security', 'api', 'payment'],
    baseRisk: 'high',
};
const PAYMENT = {
    id: 'payment',
    displayName: 'Payment',
    description: 'Stripe, billing, invoices, charges, subscriptions, refunds, PCI compliance, idempotency, webhook verification',
    keywords: [
        'payment', 'payments',
        'billing', 'bill',
        'stripe', 'braintree', 'paypal', 'adyen',
        'invoice', 'invoicing',
        'charge', 'chargeback',
        'subscription', 'recurring',
        'refund', 'dispute',
        'pci', 'pci dss', 'pci compliance',
        'idempotency', 'idempotency key',
        'webhook verification',
        'checkout',
        'price', 'pricing',
        'wallet', 'digital wallet',
        'settlement', 'reconciliation',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['auth', 'security', 'resilience'],
    baseRisk: 'high',
};
const UI = {
    id: 'ui',
    displayName: 'UI',
    description: 'Components, React, Vue, Angular, TSX, JSX, forms, buttons, modals, pages, layouts, CSS',
    keywords: [
        'component', 'components',
        'react', 'reactjs',
        'vue', 'vuejs',
        'angular',
        'tsx', 'jsx',
        'form', 'input field',
        'button', 'btn',
        'modal', 'dialog',
        'page', 'view', 'screen',
        'layout',
        'css', 'scss', 'sass', 'tailwind', 'styled-components',
        'style', 'styling',
        'ui', 'frontend', 'front-end',
        'accessible', 'accessibility', 'a11y', 'aria',
        'responsive', 'mobile',
        'animation', 'transition',
        'theme', 'dark mode',
    ],
    negativeExamples: [],
    exclusionTerms: [],
    relatedDomains: ['api', 'auth'],
    baseRisk: 'low',
};
// ── ALL_DOMAINS export ────────────────────────────────────────────────────────
exports.ALL_DOMAINS = [
    SECURITY,
    RESILIENCE,
    INFRASTRUCTURE,
    API,
    CONCURRENCY,
    OBSERVABILITY,
    CACHING,
    MESSAGING,
    DATA_ACCESS,
    ML_INFERENCE,
    ORCHESTRATION,
    AUTH,
    PAYMENT,
    UI,
];
// ── classifyDomains ───────────────────────────────────────────────────────────
/**
 * Classify an intent string into domains.
 * Returns: { primary: string[], secondary: string[], confidence: number }
 *
 * Algorithm:
 * 1. Score each domain by counting keyword matches (case-insensitive)
 * 2. Apply exclusion rules — remove domains where exclusion terms dominate
 * 3. Primary domains: score >= 2 matches
 * 4. Secondary domains: score == 1 match, not excluded
 * 5. Confidence: 1.0 if clear winner, 0.7 if multiple tied domains, 0.5 if mostly secondary
 */
function classifyDomains(intent) {
    if (!intent || !intent.trim()) {
        return { primary: [], secondary: [], confidence: 0 };
    }
    const lower = intent.toLowerCase();
    // Score each domain
    const scores = new Map();
    for (const domain of exports.ALL_DOMAINS) {
        let score = 0;
        for (const keyword of domain.keywords) {
            if (lower.includes(keyword.toLowerCase())) {
                score += 1;
            }
        }
        if (score > 0) {
            scores.set(domain.id, score);
        }
    }
    // Apply exclusion rules: if a domain has exclusionTerms and those terms are
    // strongly present, the domain cannot be primary.
    const excluded = new Set();
    for (const domain of exports.ALL_DOMAINS) {
        if (domain.exclusionTerms.length === 0)
            continue;
        let exclusionHits = 0;
        for (const term of domain.exclusionTerms) {
            if (lower.includes(term.toLowerCase())) {
                exclusionHits += 1;
            }
        }
        // If exclusion hits exceed 2 OR exceed 50% of positively matched keywords,
        // this domain cannot be primary.
        const domainScore = scores.get(domain.id) ?? 0;
        const threshold = Math.max(2, Math.ceil(domainScore * 0.5));
        if (exclusionHits >= threshold) {
            excluded.add(domain.id);
        }
    }
    // Separate primary (score >= 2, not excluded) from secondary (score == 1, not excluded)
    const primary = [];
    const secondary = [];
    for (const [id, score] of scores.entries()) {
        if (excluded.has(id))
            continue;
        if (score >= 2) {
            primary.push({ id, score });
        }
        else {
            secondary.push(id);
        }
    }
    // Sort primary by score descending
    primary.sort((a, b) => b.score - a.score);
    const primaryIds = primary.map(p => p.id);
    // Determine confidence
    let confidence;
    if (primaryIds.length === 0 && secondary.length === 0) {
        confidence = 0;
    }
    else if (primaryIds.length === 1) {
        confidence = 1.0;
    }
    else if (primaryIds.length > 1) {
        // Check if there's a clear winner (top score significantly higher than 2nd)
        const topScore = primary[0].score;
        const secondScore = primary[1]?.score ?? 0;
        confidence = topScore > secondScore * 1.5 ? 0.9 : 0.7;
    }
    else {
        // Only secondary matches
        confidence = 0.5;
    }
    return { primary: primaryIds, secondary, confidence };
}
// ── getEffectiveRisk ──────────────────────────────────────────────────────────
/**
 * Get the effective risk level for a set of classified domains.
 * Returns the highest base risk among primary domains.
 */
function getEffectiveRisk(primaryDomains) {
    const riskOrder = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3,
    };
    let maxRisk = 'low';
    let maxLevel = 0;
    for (const id of primaryDomains) {
        const def = exports.ALL_DOMAINS.find(d => d.id === id);
        if (!def)
            continue;
        const level = riskOrder[def.baseRisk] ?? 0;
        if (level > maxLevel) {
            maxLevel = level;
            maxRisk = def.baseRisk;
        }
    }
    return maxRisk;
}
//# sourceMappingURL=domain-taxonomy.js.map