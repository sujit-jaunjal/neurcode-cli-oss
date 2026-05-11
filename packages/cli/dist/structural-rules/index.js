"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DS002MissingCorrelationId = exports.DS001SagaRollbackAbsence = exports.SR016UnsafeJSONParse = exports.SR015DanglingAbortController = exports.SR014MutableClosureAsync = exports.SR013MissingIdempotencyKey = exports.SR012PromiseRaceLeak = exports.SR011EventListenerLeak = exports.PY010LeakedAiohttpSession = exports.PY009UnsafePickleDeserialization = exports.PY008CeleryTaskWithoutRetry = exports.PY007SQLAlchemySessionLeak = exports.PY006BlockingIOInAsync = exports.PY005FastAPIWithoutPydantic = exports.PY004SwallowedAsyncException = exports.PY003BroadExceptClause = exports.PY002UnboundedDictSingleton = exports.PY001AsyncioTaskWithoutCancel = exports.SR010RetryStorm = exports.SR009MissingRetryBackoff = exports.SR008BackgroundTaskOrphan = exports.SR007CrossRequestError = exports.SR006FanoutErrorSanitization = exports.SR005HalfOpenProbeGate = exports.SR004RequestBoundaryNoValidation = exports.SR003TimerWithoutCleanup = exports.SR002UnboundedCollection = exports.SR001SwallowedAsyncRejection = exports.applyContextualSeverity = exports.adjustViolationSeverity = exports.classifyFileContext = exports.applySuppressions = exports.parseSuppressionDirectives = exports.StructuralRuleEngine = void 0;
exports.createDefaultStructuralRuleEngine = createDefaultStructuralRuleEngine;
var engine_1 = require("./engine");
Object.defineProperty(exports, "StructuralRuleEngine", { enumerable: true, get: function () { return engine_1.StructuralRuleEngine; } });
var suppressions_1 = require("./suppressions");
Object.defineProperty(exports, "parseSuppressionDirectives", { enumerable: true, get: function () { return suppressions_1.parseSuppressionDirectives; } });
Object.defineProperty(exports, "applySuppressions", { enumerable: true, get: function () { return suppressions_1.applySuppressions; } });
var context_severity_1 = require("./context-severity");
Object.defineProperty(exports, "classifyFileContext", { enumerable: true, get: function () { return context_severity_1.classifyFileContext; } });
Object.defineProperty(exports, "adjustViolationSeverity", { enumerable: true, get: function () { return context_severity_1.adjustViolationSeverity; } });
Object.defineProperty(exports, "applyContextualSeverity", { enumerable: true, get: function () { return context_severity_1.applyContextualSeverity; } });
// TypeScript rules
var SR001_swallowed_async_rejection_1 = require("./rules/SR001-swallowed-async-rejection");
Object.defineProperty(exports, "SR001SwallowedAsyncRejection", { enumerable: true, get: function () { return SR001_swallowed_async_rejection_1.SR001SwallowedAsyncRejection; } });
var SR002_unbounded_collection_1 = require("./rules/SR002-unbounded-collection");
Object.defineProperty(exports, "SR002UnboundedCollection", { enumerable: true, get: function () { return SR002_unbounded_collection_1.SR002UnboundedCollection; } });
var SR003_timer_without_cleanup_1 = require("./rules/SR003-timer-without-cleanup");
Object.defineProperty(exports, "SR003TimerWithoutCleanup", { enumerable: true, get: function () { return SR003_timer_without_cleanup_1.SR003TimerWithoutCleanup; } });
var SR004_request_boundary_no_validation_1 = require("./rules/SR004-request-boundary-no-validation");
Object.defineProperty(exports, "SR004RequestBoundaryNoValidation", { enumerable: true, get: function () { return SR004_request_boundary_no_validation_1.SR004RequestBoundaryNoValidation; } });
var SR005_halfopen_probe_gate_1 = require("./rules/SR005-halfopen-probe-gate");
Object.defineProperty(exports, "SR005HalfOpenProbeGate", { enumerable: true, get: function () { return SR005_halfopen_probe_gate_1.SR005HalfOpenProbeGate; } });
var SR006_fanout_error_sanitization_1 = require("./rules/SR006-fanout-error-sanitization");
Object.defineProperty(exports, "SR006FanoutErrorSanitization", { enumerable: true, get: function () { return SR006_fanout_error_sanitization_1.SR006FanoutErrorSanitization; } });
var SR007_cross_request_error_1 = require("./rules/SR007-cross-request-error");
Object.defineProperty(exports, "SR007CrossRequestError", { enumerable: true, get: function () { return SR007_cross_request_error_1.SR007CrossRequestError; } });
var SR008_background_task_orphan_1 = require("./rules/SR008-background-task-orphan");
Object.defineProperty(exports, "SR008BackgroundTaskOrphan", { enumerable: true, get: function () { return SR008_background_task_orphan_1.SR008BackgroundTaskOrphan; } });
var SR009_missing_retry_backoff_1 = require("./rules/SR009-missing-retry-backoff");
Object.defineProperty(exports, "SR009MissingRetryBackoff", { enumerable: true, get: function () { return SR009_missing_retry_backoff_1.SR009MissingRetryBackoff; } });
var SR010_retry_storm_1 = require("./rules/SR010-retry-storm");
Object.defineProperty(exports, "SR010RetryStorm", { enumerable: true, get: function () { return SR010_retry_storm_1.SR010RetryStorm; } });
// Python rules
var PY001_asyncio_task_without_cancel_1 = require("./python/PY001-asyncio-task-without-cancel");
Object.defineProperty(exports, "PY001AsyncioTaskWithoutCancel", { enumerable: true, get: function () { return PY001_asyncio_task_without_cancel_1.PY001AsyncioTaskWithoutCancel; } });
var PY002_unbounded_dict_singleton_1 = require("./python/PY002-unbounded-dict-singleton");
Object.defineProperty(exports, "PY002UnboundedDictSingleton", { enumerable: true, get: function () { return PY002_unbounded_dict_singleton_1.PY002UnboundedDictSingleton; } });
var PY003_broad_except_clause_1 = require("./python/PY003-broad-except-clause");
Object.defineProperty(exports, "PY003BroadExceptClause", { enumerable: true, get: function () { return PY003_broad_except_clause_1.PY003BroadExceptClause; } });
var PY004_swallowed_async_exception_1 = require("./python/PY004-swallowed-async-exception");
Object.defineProperty(exports, "PY004SwallowedAsyncException", { enumerable: true, get: function () { return PY004_swallowed_async_exception_1.PY004SwallowedAsyncException; } });
var PY005_fastapi_without_pydantic_1 = require("./python/PY005-fastapi-without-pydantic");
Object.defineProperty(exports, "PY005FastAPIWithoutPydantic", { enumerable: true, get: function () { return PY005_fastapi_without_pydantic_1.PY005FastAPIWithoutPydantic; } });
var PY006_blocking_io_in_async_1 = require("./python/PY006-blocking-io-in-async");
Object.defineProperty(exports, "PY006BlockingIOInAsync", { enumerable: true, get: function () { return PY006_blocking_io_in_async_1.PY006BlockingIOInAsync; } });
var PY007_sqlalchemy_session_leak_1 = require("./python/PY007-sqlalchemy-session-leak");
Object.defineProperty(exports, "PY007SQLAlchemySessionLeak", { enumerable: true, get: function () { return PY007_sqlalchemy_session_leak_1.PY007SQLAlchemySessionLeak; } });
var PY008_celery_task_without_retry_1 = require("./python/PY008-celery-task-without-retry");
Object.defineProperty(exports, "PY008CeleryTaskWithoutRetry", { enumerable: true, get: function () { return PY008_celery_task_without_retry_1.PY008CeleryTaskWithoutRetry; } });
var PY009_unsafe_pickle_deserialization_1 = require("./python/PY009-unsafe-pickle-deserialization");
Object.defineProperty(exports, "PY009UnsafePickleDeserialization", { enumerable: true, get: function () { return PY009_unsafe_pickle_deserialization_1.PY009UnsafePickleDeserialization; } });
var PY010_leaked_aiohttp_session_1 = require("./python/PY010-leaked-aiohttp-session");
Object.defineProperty(exports, "PY010LeakedAiohttpSession", { enumerable: true, get: function () { return PY010_leaked_aiohttp_session_1.PY010LeakedAiohttpSession; } });
// TypeScript rules — extended set
var SR011_event_listener_leak_1 = require("./rules/SR011-event-listener-leak");
Object.defineProperty(exports, "SR011EventListenerLeak", { enumerable: true, get: function () { return SR011_event_listener_leak_1.SR011EventListenerLeak; } });
var SR012_promise_race_leak_1 = require("./rules/SR012-promise-race-leak");
Object.defineProperty(exports, "SR012PromiseRaceLeak", { enumerable: true, get: function () { return SR012_promise_race_leak_1.SR012PromiseRaceLeak; } });
var SR013_missing_idempotency_key_1 = require("./rules/SR013-missing-idempotency-key");
Object.defineProperty(exports, "SR013MissingIdempotencyKey", { enumerable: true, get: function () { return SR013_missing_idempotency_key_1.SR013MissingIdempotencyKey; } });
var SR014_mutable_closure_async_1 = require("./rules/SR014-mutable-closure-async");
Object.defineProperty(exports, "SR014MutableClosureAsync", { enumerable: true, get: function () { return SR014_mutable_closure_async_1.SR014MutableClosureAsync; } });
var SR015_dangling_abort_controller_1 = require("./rules/SR015-dangling-abort-controller");
Object.defineProperty(exports, "SR015DanglingAbortController", { enumerable: true, get: function () { return SR015_dangling_abort_controller_1.SR015DanglingAbortController; } });
var SR016_unsafe_json_parse_1 = require("./rules/SR016-unsafe-json-parse");
Object.defineProperty(exports, "SR016UnsafeJSONParse", { enumerable: true, get: function () { return SR016_unsafe_json_parse_1.SR016UnsafeJSONParse; } });
// Distributed rules
var DS001_saga_rollback_absence_1 = require("./distributed/DS001-saga-rollback-absence");
Object.defineProperty(exports, "DS001SagaRollbackAbsence", { enumerable: true, get: function () { return DS001_saga_rollback_absence_1.DS001SagaRollbackAbsence; } });
var DS002_missing_correlation_id_1 = require("./distributed/DS002-missing-correlation-id");
Object.defineProperty(exports, "DS002MissingCorrelationId", { enumerable: true, get: function () { return DS002_missing_correlation_id_1.DS002MissingCorrelationId; } });
const engine_2 = require("./engine");
const SR001_swallowed_async_rejection_2 = require("./rules/SR001-swallowed-async-rejection");
const SR002_unbounded_collection_2 = require("./rules/SR002-unbounded-collection");
const SR003_timer_without_cleanup_2 = require("./rules/SR003-timer-without-cleanup");
const SR004_request_boundary_no_validation_2 = require("./rules/SR004-request-boundary-no-validation");
const SR005_halfopen_probe_gate_2 = require("./rules/SR005-halfopen-probe-gate");
const SR006_fanout_error_sanitization_2 = require("./rules/SR006-fanout-error-sanitization");
const SR007_cross_request_error_2 = require("./rules/SR007-cross-request-error");
const SR008_background_task_orphan_2 = require("./rules/SR008-background-task-orphan");
const SR009_missing_retry_backoff_2 = require("./rules/SR009-missing-retry-backoff");
const SR010_retry_storm_2 = require("./rules/SR010-retry-storm");
const PY001_asyncio_task_without_cancel_2 = require("./python/PY001-asyncio-task-without-cancel");
const PY002_unbounded_dict_singleton_2 = require("./python/PY002-unbounded-dict-singleton");
const PY003_broad_except_clause_2 = require("./python/PY003-broad-except-clause");
const PY004_swallowed_async_exception_2 = require("./python/PY004-swallowed-async-exception");
const PY005_fastapi_without_pydantic_2 = require("./python/PY005-fastapi-without-pydantic");
const PY006_blocking_io_in_async_2 = require("./python/PY006-blocking-io-in-async");
const PY007_sqlalchemy_session_leak_2 = require("./python/PY007-sqlalchemy-session-leak");
const PY008_celery_task_without_retry_2 = require("./python/PY008-celery-task-without-retry");
const PY009_unsafe_pickle_deserialization_2 = require("./python/PY009-unsafe-pickle-deserialization");
const PY010_leaked_aiohttp_session_2 = require("./python/PY010-leaked-aiohttp-session");
const SR011_event_listener_leak_2 = require("./rules/SR011-event-listener-leak");
const SR012_promise_race_leak_2 = require("./rules/SR012-promise-race-leak");
const SR013_missing_idempotency_key_2 = require("./rules/SR013-missing-idempotency-key");
const SR014_mutable_closure_async_2 = require("./rules/SR014-mutable-closure-async");
const SR015_dangling_abort_controller_2 = require("./rules/SR015-dangling-abort-controller");
const SR016_unsafe_json_parse_2 = require("./rules/SR016-unsafe-json-parse");
const DS001_saga_rollback_absence_2 = require("./distributed/DS001-saga-rollback-absence");
const DS002_missing_correlation_id_2 = require("./distributed/DS002-missing-correlation-id");
/**
 * Creates and returns a pre-configured StructuralRuleEngine with all rules registered.
 * This is the standard way to get a ready-to-use engine.
 */
function createDefaultStructuralRuleEngine() {
    const engine = new engine_2.StructuralRuleEngine();
    engine.registerAll([
        new SR001_swallowed_async_rejection_2.SR001SwallowedAsyncRejection(),
        new SR002_unbounded_collection_2.SR002UnboundedCollection(),
        new SR003_timer_without_cleanup_2.SR003TimerWithoutCleanup(),
        new SR004_request_boundary_no_validation_2.SR004RequestBoundaryNoValidation(),
        new SR005_halfopen_probe_gate_2.SR005HalfOpenProbeGate(),
        new SR006_fanout_error_sanitization_2.SR006FanoutErrorSanitization(),
        new SR007_cross_request_error_2.SR007CrossRequestError(),
        new SR008_background_task_orphan_2.SR008BackgroundTaskOrphan(),
        new SR009_missing_retry_backoff_2.SR009MissingRetryBackoff(),
        new SR010_retry_storm_2.SR010RetryStorm(),
        new PY001_asyncio_task_without_cancel_2.PY001AsyncioTaskWithoutCancel(),
        new PY002_unbounded_dict_singleton_2.PY002UnboundedDictSingleton(),
        new PY003_broad_except_clause_2.PY003BroadExceptClause(),
        new PY004_swallowed_async_exception_2.PY004SwallowedAsyncException(),
        new PY005_fastapi_without_pydantic_2.PY005FastAPIWithoutPydantic(),
        new PY006_blocking_io_in_async_2.PY006BlockingIOInAsync(),
        new PY007_sqlalchemy_session_leak_2.PY007SQLAlchemySessionLeak(),
        new PY008_celery_task_without_retry_2.PY008CeleryTaskWithoutRetry(),
        new PY009_unsafe_pickle_deserialization_2.PY009UnsafePickleDeserialization(),
        new PY010_leaked_aiohttp_session_2.PY010LeakedAiohttpSession(),
        new SR011_event_listener_leak_2.SR011EventListenerLeak(),
        new SR012_promise_race_leak_2.SR012PromiseRaceLeak(),
        new SR013_missing_idempotency_key_2.SR013MissingIdempotencyKey(),
        new SR014_mutable_closure_async_2.SR014MutableClosureAsync(),
        new SR015_dangling_abort_controller_2.SR015DanglingAbortController(),
        new SR016_unsafe_json_parse_2.SR016UnsafeJSONParse(),
        new DS001_saga_rollback_absence_2.DS001SagaRollbackAbsence(),
        new DS002_missing_correlation_id_2.DS002MissingCorrelationId(),
    ]);
    return engine;
}
//# sourceMappingURL=index.js.map