// ==UserScript==
// @name         D-DART (Driver Detention Analysis & Review Tool) v10.5
// @namespace    http://tampermonkey.net/
// @version      10.5
// @description  Enterprise Batch Driver Detention Analysis & Review Tool - Refactored & Optimized
// @author       Sachin Vallakati
// @match        *://share.amazon.com/*
// @match        *://trans-logistics.amazon.com/*
// @match        *://smc-na-iad.iad.proxy.amazon.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      smc-na-iad.iad.proxy.amazon.com
// @connect      smc.amazon.com
// @connect      us-east-1.prod.api.execution-tools.freight.amazon.dev
// @connect      trans-logistics.amazon.com
// @connect      amazon.sharepoint.com
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/vallsach/DDART-Releases/main/D-DART%20(Driver%20Detention%20Analysis%20%26%20Review%20Tool)%20v10.5.user.js
// @downloadURL  https://raw.githubusercontent.com/vallsach/DDART-Releases/main/D-DART%20(Driver%20Detention%20Analysis%20%26%20Review%20Tool)%20v10.5.user.js
// @homepageURL  https://github.com/vallsach/DDART-Releases
// @supportURL   https://github.com/vallsach/DDART-Releases/issues
// @run-at       document-end
// ==/UserScript==

/**
 * @fileoverview D-DART - Driver Detention Analysis & Review Tool v10.5
 * Enterprise-grade tool for analyzing and processing driver detention charges
 * with dynamic SOW configuration from SharePoint.
 *
 * @author Sachin Vallakati
 * @version 10.5
 * @license MIT
 *
 * @changelog v10.5
 * - Complete code refactoring and optimization
 * - Removed all dead code and unused functions
 * - Fixed memory leaks in event listeners and timers
 * - Implemented proper dependency injection pattern
 * - Standardized error handling across all modules
 * - Optimized DOM operations and loop performance
 * - Removed incomplete features (virtual scrolling, undo)
 * - Added comprehensive cleanup on all termination paths
 * - Improved type safety with runtime validation
 * - Centralized all string constants
 * - Enhanced security with conditional debug exposure
 * - Fixed circular dependencies between modules
 * - Improved cache management with LRU eviction
 * - Added proper AbortController support for cancellation
 * - Optimized telemetry with batched events
 * - Fixed race conditions in token management
 * - Enhanced accessibility compliance
 */

(function() {
    'use strict';

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 1: TYPE DEFINITIONS (JSDoc)
     * ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * @typedef {Object} OrderData
     * @property {string} orderId - The order identifier
     * @property {Object|null} viewData - Order view data from SMC
     * @property {Object|null} fullData - Full order data from SMC
     * @property {Object|null} smcExecutionData - SMC execution data
     * @property {Object|null} fmcData - FMC data
     * @property {Object|null} fmcTimestamps - Extracted FMC timestamps
     * @property {Array<AnalysisResult>} analysisResults - Stop analysis results
     * @property {string} shipperName - Shipper name
     * @property {SOWConfig|null} sowConfig - SOW configuration
     */

    /**
     * @typedef {Object} AnalysisResult
     * @property {string} type - Result type from ResultType enum
     * @property {number} charge - Calculated charge amount
     * @property {string} breakdown - Breakdown description
     * @property {boolean} hitMax - Whether max charge was hit
     * @property {string} action - Action type from ActionType enum
     * @property {string} actionText - Display text for action
     * @property {string} comment - Comment to add to order
     * @property {boolean} hasHold - Whether hold exists
     * @property {string|null} holdCode - Hold pricing code
     * @property {boolean} detentionExists - Whether detention line exists
     * @property {number} existingAmount - Existing charge amount
     * @property {boolean} isPickup - Whether this is a pickup stop
     * @property {Object|null} fmcTimestamps - FMC timestamp data
     * @property {boolean} requiresApproval - Whether approval is required
     * @property {boolean} autoChargeAllowed - Whether auto-charge is allowed
     * @property {boolean} authNumberRequired - Whether auth number is required
     * @property {SOWConfig|null} sowConfig - SOW configuration
     * @property {boolean} processed - Whether action was processed
     * @property {string|null} processedAction - Type of processed action
     * @property {number|null} processedAmount - Processed amount
     * @property {string|null} processError - Error message if processing failed
     */

    /**
     * @typedef {Object} SOWConfig
     * @property {string} shipperName - Shipper name
     * @property {number} rate - Rate per unit
     * @property {string} rateUnit - 'HOUR' or 'MINUTE'
     * @property {number} maxCharge - Maximum charge cap
     * @property {number|null} billingIncrement - Billing increment in minutes
     * @property {string|null} roundingRule - 'UP', 'DOWN', or 'NEAREST'
     * @property {number|null} roundDownMaxMinutes - Minimum threshold
     * @property {boolean} requiresApproval - Whether approval is required
     * @property {boolean} autoChargeAllowed - Whether auto-charge is allowed
     * @property {boolean} authNumberRequired - Whether auth number is required
     * @property {boolean} isActive - Whether SOW is active
     * @property {string} notes - Additional notes
     * @property {boolean} isComplete - Whether config is complete
     * @property {Object} rules - Stop type rules
     * @property {Object} displayInfo - Display information
     */

    /**
     * @typedef {Object} TokenStatus
     * @property {string} status - 'ready', 'warning', 'fetching', 'expired', 'missing'
     * @property {string} text - Display text
     * @property {string} class - CSS class
     * @property {number} remainingSeconds - Seconds until expiration
     */

    /**
     * @typedef {Object} BatchReportEntry
     * @property {string} orderId - Order ID
     * @property {string} shipper - Shipper name
     * @property {string} action - Action taken
     * @property {string} amount - Amount string
     * @property {string} status - Status string
     * @property {string} notes - Additional notes
     */

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 2: CONFIGURATION
     * ═══════════════════════════════════════════════════════════════════════════ */

    const CONFIG = Object.freeze({
        VERSION: '10.5',
        APP_NAME: 'D-DART',
        APP_SUBTITLE: 'Production',
        AUTHOR: 'Sachin Vallakati',

        // SharePoint Configuration
        SHAREPOINT: Object.freeze({
            SITE_URL: 'https://amazon.sharepoint.com/sites/DDART-Config',
            LIST_NAME: 'SOWConfiguration',
            API_URL: 'https://amazon.sharepoint.com/sites/DDART-Config/_api/web/lists/getbytitle(\'SOWConfiguration\')/items',
            REQUEST_TIMEOUT: 30000
        }),

        // GitHub Configuration
        GITHUB: Object.freeze({
            USERNAME: 'vallsach',
            REPOSITORY: 'DDART-Releases',
            BRANCH: 'main',
            API_URL: 'https://api.github.com/repos/vallsach/DDART-Releases/contents',
            RAW_BASE_URL: 'https://raw.githubusercontent.com/vallsach/DDART-Releases/main',
            FILENAME_PATTERN: /^D-DART\s*\(Driver Detention Analysis & Review Tool\)\s*v([\d.]+)\.user\.js$/i,
            REQUEST_TIMEOUT: 15000,
            RETRY_ATTEMPTS: 3,
            RETRY_DELAY: 2000
        }),

        // Cache Settings
        CACHE: Object.freeze({
            DURATION: 5 * 60 * 1000,
            MAX_SIZE: 200,
            CLEANUP_INTERVAL: 60000
        }),

        // UI Settings
        UI: Object.freeze({
            TOAST_DURATION: 3000,
            PANEL_WIDTH: 520,
            PANEL_MIN_WIDTH: 56,
            SETTINGS_PANEL_WIDTH: 500,
            COPY_POPUP_DURATION: 2000,
            ANIMATION_DURATION: 300,
            DEBOUNCE_DELAY: 150
        }),

        // Token Settings
        TOKEN: Object.freeze({
            MAX_AGE: 2 * 60 * 1000,
            WARNING_THRESHOLD: 30,
            CRITICAL_THRESHOLD: 10,
            STORAGE_KEY: 'ddart_csrf',
            TIME_KEY: 'ddart_csrf_time',
            UPDATE_INTERVAL: 1000,
            REFRESH_INTERVAL: 60000,
            FETCH_TIMEOUT: 15000
        }),

        // API Settings
        API: Object.freeze({
            REQUEST_TIMEOUT: 30000,
            MAX_RETRIES: 3,
            RETRY_BASE_DELAY: 300,
            RETRY_MAX_DELAY: 5000,
            RATE_LIMIT_MULTIPLIER: 2
        }),

        // Circuit Breaker Settings
        CIRCUIT_BREAKER: Object.freeze({
            FAILURE_THRESHOLD: 5,
            SUCCESS_THRESHOLD: 2,
            RESET_TIMEOUT: 30000
        }),

        // Batch Settings
        BATCH: Object.freeze({
            PARALLEL_SIZE: 5,
            MAX_ORDERS_PER_SESSION: 2000,
            CHUNK_SIZE: 50,
            CHUNK_DELAY: 1500,
            RATE_LIMIT_DELAY: 800,
            PROGRESS_SAVE_INTERVAL: 10,
            STORAGE_KEY: 'ddart_batch_progress',
            UI_UPDATE_INTERVAL: 300,
            PAUSE_CHECK_INTERVAL: 500
        }),

        // Approval Settings
        APPROVAL: Object.freeze({
            TIMEOUT: 30000,
            WARNING_TIME: 10,
            CRITICAL_TIME: 5,
            COUNTDOWN_INTERVAL: 1000
        }),

        // Timing Thresholds
        TIMING: Object.freeze({
            EARLY_MINUTES: -5,
            ON_TIME_MINUTES: 15,
            LATE_MINUTES: 0
        }),

        // Validation
        VALIDATION: Object.freeze({
            ORDER_ID_PATTERN: /^[A-Za-z0-9-_]+$/,
            ORDER_ID_MIN_LENGTH: 5,
            ORDER_ID_MAX_LENGTH: 50,
            AUTH_NUMBER_MAX_LENGTH: 100,
            MAX_CHARGE_AMOUNT: 10000
        }),

        // URLs
        URLS: Object.freeze({
            SMC_BASE: 'https://smc-na-iad.iad.proxy.amazon.com',
            SMC_ORDER: 'https://smc-na-iad.iad.proxy.amazon.com/order',
            SMC_EXECUTION_API: 'https://us-east-1.prod.api.execution-tools.freight.amazon.dev',
            FMC_BASE: 'https://trans-logistics.amazon.com',
            FMC_SEARCH: 'https://trans-logistics.amazon.com/fmc/execution/search'
        }),

        ALLOWED_DOMAINS: Object.freeze([
            'smc-na-iad.iad.proxy.amazon.com',
            'trans-logistics.amazon.com',
            'smc.amazon.com',
            'amazon.sharepoint.com',
            'api.github.com',
            'raw.githubusercontent.com'
        ]),

        INITIAL_POSITION: Object.freeze({
            top: '20px',
            left: '20px',
            right: 'auto'
        }),

        // Feature Flags
        FEATURES: Object.freeze({
            TELEMETRY_ENABLED: true,
            AUTO_UPDATE_CHECK: true,
            FORCE_VERSION_MATCH: true,
            DEBUG_MODE: true
        }),

        START_MINIMIZED: true,
        MAX_DEBUG_LOGS: 300,

        // Progress Persistence
        PROGRESS: Object.freeze({
            MAX_AGE: 7200000,
            SAVE_THROTTLE: 5000
        }),

        // Telemetry
        TELEMETRY: Object.freeze({
            MAX_EVENTS: 500,
            FLUSH_INTERVAL: 60000
        })
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 3: CSS CLASS NAMES (Centralized)
     * ═══════════════════════════════════════════════════════════════════════════ */

    const CSS_CLASSES = Object.freeze({
        CONTAINER: 'd-dart',
        MINIMIZED: 'minimized',
        DRAGGING: 'dragging',
        HEALTHY: 'healthy',
        UNHEALTHY: 'unhealthy',
        ERROR: 'error',
        SUCCESS: 'success',
        WARNING: 'warning',
        PENDING: 'pending',
        LOADING: 'loading',
        EXPANDED: 'expanded',
        ACTIVE: 'active',
        COMPLETED: 'completed',

        // Status classes
        STATUS_ACTIVE: 'status-active',
        STATUS_INACTIVE: 'status-inactive',
        STATUS_ERROR: 'status-error',

        // Token indicator
        TOKEN_READY: 'ready',
        TOKEN_WARNING: 'warning',
        TOKEN_CRITICAL: 'critical',
        TOKEN_FETCHING: 'fetching',

        // SOW indicator
        SOW_LOADED: 'loaded',
        SOW_LOADING: 'loading',
        SOW_ERROR: 'error',

        // Stop types
        PICKUP: 'pickup',
        DROPOFF: 'dropoff',

        // Timing
        EARLY: 'early',
        LATE: 'late',
        ON_TIME: 'on-time'
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 4: CENTRALIZED MESSAGES
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Messages = Object.freeze({
        ERRORS: Object.freeze({
            NO_DATA: 'No data to download',
            TOKEN_MISSING: 'Could not obtain CSRF token. Please log into SMC.',
            TOKEN_EXPIRED: 'CSRF token expired',
            INVALID_ORDER_IDS: 'Enter valid Order ID(s)',
            NETWORK_ERROR: 'Network connection failed. Please check your connection.',
            AUTH_ERROR: 'Authentication expired. Please refresh and log in again.',
            TIMEOUT_ERROR: 'Request timed out. Please try again.',
            PARSE_ERROR: 'Failed to process server response.',
            UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
            VERSION_CONFLICT: 'Version conflict - order was modified',
            RESOURCE_NOT_FOUND: 'Resource not found',
            SOW_NOT_CONFIGURED: (shipper) => `SOW not configured for: ${shipper}`,
            SOW_DISABLED: (shipper) => `SOW is disabled for ${shipper}. Contact tool admin.`,
            SOW_INCOMPLETE: (shipper) => `Incomplete SOW configuration for: ${shipper}`,
            SOW_SERVER_UNREACHABLE: 'SOW Server Unreachable - Click to retry',
            SOW_AUTH_REQUIRED: 'Please login to SharePoint, then click Retry',
            AUTH_NUMBER_REQUIRED: 'Authorization number is required',
            COPY_FAILED: 'Failed to copy to clipboard',
            NO_EXECUTION_LEGS: 'No execution legs found in order',
            NO_TOUR_ID: 'No Tour ID found in execution leg',
            FMC_API_FAILURE: 'FMC API returned failure',
            EMPTY_RESPONSE: 'Empty response from API',
            BATCH_TOO_LARGE: (max) => `Maximum ${max} orders per session. Please split your batch.`,
            RATE_LIMITED: 'Rate limited by server, slowing down...',
            CIRCUIT_BREAKER_OPEN: 'Service temporarily unavailable. Please try again later.',
            UPDATE_CHECK_FAILED: 'Unable to verify version. Please check your internet connection.',
            UPDATE_REQUIRED: 'Update required to continue using D-DART.',
            NO_SCRIPT_FILES_FOUND: 'No D-DART script files found in repository.'
        }),
        SUCCESS: Object.freeze({
            CSV_DOWNLOADED: 'CSV downloaded!',
            TXT_DOWNLOADED: 'TXT downloaded!',
            DEBUG_COPIED: 'Debug Log Copied!',
            TOKEN_FETCHED: 'Token fetched successfully',
            ORDER_UPDATED: 'Order updated successfully',
            CHARGE_ADDED: 'Charge added successfully',
            HOLD_RELEASED: 'Hold released successfully',
            SOW_LOADED: (count) => `SOW loaded: ${count} shipper(s)`,
            SOW_REFRESHED: 'SOW configuration refreshed',
            BATCH_COMPLETE: (success, failed) => `Batch complete: ${success} processed, ${failed} failed`,
            SETTINGS_SAVED: 'Settings saved',
            VERSION_CHECK_PASSED: 'Version verified successfully'
        }),
        INFO: Object.freeze({
            PROCESSING: 'Processing...',
            AWAITING_ARRIVAL: 'Awaiting arrival',
            AWAITING_DEPARTURE: 'Awaiting departure',
            NO_ACTION_NEEDED: 'No Action Needed',
            DRIVER_LATE: 'Driver late - No charge',
            DROP_HOOK: 'Drop & Hook - No detention',
            WITHIN_FREE_TIME: 'Within free time',
            BELOW_MINIMUM: 'Below minimum threshold',
            ANALYSIS_ONLY: 'Analysis only - Auto-charge disabled',
            BATCH_PAUSED: 'Batch paused - Click Resume to continue',
            BATCH_CANCELLED: 'Batch cancelled by user',
            TOKEN_REFRESHING: 'Refreshing authentication token...',
            COOLING_DOWN: 'Cooling down before next chunk...',
            SOW_LOADING: 'Loading SOW configuration...',
            CHECKING_VERSION: 'Checking for updates...',
            VERSION_UP_TO_DATE: 'You are using the latest version.'
        }),
        COMMENTS: Object.freeze({
            ADD_CHARGE: 'Driver Detention Charge Added',
            RELEASE_HOLD: 'As per FMC time stamps there is no delay for this load, there are no emails for the delay hence releasing the $0 DD charge.',
            CHARGE_WITH_AUTH: (authNumber) => `Driver Detention Charge Added - (${authNumber})`,
            APPROVAL_DECLINED: 'Shipper rejected DD charge, Releasing DD hold.'
        }),
        ACCESSIBILITY: Object.freeze({
            PANEL_LABEL: 'D-DART Driver Detention Analysis Tool',
            EXPAND_PANEL: 'Expand D-DART panel',
            MINIMIZE_PANEL: 'Minimize panel',
            OPEN_SETTINGS: 'Open settings',
            RESET_FORM: 'Reset form',
            COPY_DEBUG: 'Copy debug log',
            ANALYZE_ORDERS: 'Analyze orders',
            ORDER_INPUT: 'Order IDs input',
            RESULTS_REGION: 'Analysis results',
            CLOSE_SETTINGS: 'Close settings panel',
            APPROVE_CHARGE: 'Approve charge',
            DECLINE_CHARGE: 'Decline charge',
            SKIP_ORDER: 'Skip this order',
            UPDATE_NOW: 'Update D-DART now',
            RETRY_CONNECTION: 'Retry connection'
        }),
        UPDATE: Object.freeze({
            TITLE: '🚛 D-DART UPDATE REQUIRED',
            TITLE_ERROR: '🚛 D-DART CONNECTION ERROR',
            YOUR_VERSION: 'Your version',
            LATEST_VERSION: 'Latest version',
            UPDATE_REQUIRED_MSG: 'You must update to continue using D-DART.',
            DOWNGRADE_REQUIRED_MSG: 'Your version is ahead of the official release. Please install the official version.',
            UPDATE_BUTTON: '🔄 UPDATE NOW',
            RETRY_BUTTON: '🔄 RETRY',
            CONNECTION_ERROR_MSG: 'Unable to connect to update server. Please check your internet connection and try again.',
            CHECKING: 'Checking for updates...'
        })
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 5: ENUMERATIONS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ResultType = Object.freeze({
        ORDER_CANCELLED: 'ORDER_CANCELLED',
        ORDER_INVOICED: 'ORDER_INVOICED',
        MISSING_ARRIVAL: 'MISSING_ARRIVAL',
        MISSING_DEPARTURE: 'MISSING_DEPARTURE',
        NO_DETENTION_DROP_HOOK: 'NO_DETENTION_DROP_HOOK',
        DRIVER_LATE: 'DRIVER_LATE',
        WITHIN_FREE_TIME: 'WITHIN_FREE_TIME',
        BELOW_MINIMUM_THRESHOLD: 'BELOW_MINIMUM_THRESHOLD',
        CHARGEABLE: 'CHARGEABLE',
        CHARGEABLE_MAX: 'CHARGEABLE_MAX',
        CHARGE_EXISTS: 'CHARGE_EXISTS',
        NO_HOLD_NO_CHARGE: 'NO_HOLD_NO_CHARGE',
        FMC_DATA_UNAVAILABLE: 'FMC_DATA_UNAVAILABLE',
        SOW_NOT_CONFIGURED: 'SOW_NOT_CONFIGURED',
        SOW_DISABLED: 'SOW_DISABLED',
        SOW_INCOMPLETE: 'SOW_INCOMPLETE',
        UNKNOWN_ERROR: 'UNKNOWN_ERROR'
    });

    const ActionType = Object.freeze({
        ADD_CHARGE_UPDATE: 'ADD_CHARGE_UPDATE',
        ADD_CHARGE_CREATE: 'ADD_CHARGE_CREATE',
        RELEASE_HOLD: 'RELEASE_HOLD',
        ANALYSIS_ONLY: 'ANALYSIS_ONLY',
        NO_ACTION: 'NO_ACTION',
        PENDING: 'PENDING',
        ERROR: 'ERROR',
        PENDING_APPROVAL: 'PENDING_APPROVAL',
        APPROVED: 'APPROVED',
        DECLINED: 'DECLINED',
        SKIPPED: 'SKIPPED',
        TIMEOUT: 'TIMEOUT'
    });

    const ErrorType = Object.freeze({
        NETWORK: 'NETWORK_ERROR',
        AUTH: 'AUTH_ERROR',
        VALIDATION: 'VALIDATION_ERROR',
        BUSINESS: 'BUSINESS_ERROR',
        TIMEOUT: 'TIMEOUT_ERROR',
        PARSE: 'PARSE_ERROR',
        RATE_LIMIT: 'RATE_LIMIT_ERROR',
        CIRCUIT_BREAKER: 'CIRCUIT_BREAKER_ERROR',
        SOW: 'SOW_ERROR',
        UPDATE: 'UPDATE_ERROR',
        UNKNOWN: 'UNKNOWN_ERROR'
    });

    const BatchState = Object.freeze({
        IDLE: 'IDLE',
        RUNNING: 'RUNNING',
        PAUSED: 'PAUSED',
        CANCELLED: 'CANCELLED',
        COMPLETED: 'COMPLETED'
    });

    const CircuitBreakerState = Object.freeze({
        CLOSED: 'CLOSED',
        OPEN: 'OPEN',
        HALF_OPEN: 'HALF_OPEN'
    });

    const SOWStatus = Object.freeze({
        NOT_LOADED: 'NOT_LOADED',
        LOADING: 'LOADING',
        LOADED: 'LOADED',
        ERROR: 'ERROR',
        AUTH_REQUIRED: 'AUTH_REQUIRED'
    });

    const ShipperStatus = Object.freeze({
        ACTIVE: 'ACTIVE',
        INACTIVE: 'INACTIVE',
        VALIDATION_ERROR: 'VALIDATION_ERROR'
    });

    const TelemetryEventType = Object.freeze({
        APP_INIT: 'APP_INIT',
        APP_ERROR: 'APP_ERROR',
        BATCH_START: 'BATCH_START',
        BATCH_COMPLETE: 'BATCH_COMPLETE',
        ORDER_PROCESSED: 'ORDER_PROCESSED',
        TOKEN_REFRESH: 'TOKEN_REFRESH',
        SOW_LOAD: 'SOW_LOAD',
        USER_ACTION: 'USER_ACTION',
        UPDATE_CHECK: 'UPDATE_CHECK'
    });

    const UpdateStatus = Object.freeze({
        CHECKING: 'CHECKING',
        UP_TO_DATE: 'UP_TO_DATE',
        UPDATE_REQUIRED: 'UPDATE_REQUIRED',
        ERROR: 'ERROR'
    });

    const OrderStatusMap = Object.freeze({
        'PENDING_CARRIER_ACCEPTANCE': { display: 'Tendered', color: '#f0ad4e', group: 'active' },
        'CARRIER_TENDER_ACCEPTED': { display: 'Covered', color: '#f0ad4e', group: 'active' },
        'DRIVER_DISPATCHED': { display: 'Dispatched', color: '#f0ad4e', group: 'active' },
        'LATE_TO_ARRIVE': { display: 'Late to Arrive', color: '#f0ad4e', group: 'active' },
        'ARRIVED': { display: 'Arrived', color: '#f0ad4e', group: 'active' },
        'LATE_TO_DEPART': { display: 'Late to Depart', color: '#f0ad4e', group: 'active' },
        'DEPARTED': { display: 'Departed', color: '#f0ad4e', group: 'active' },
        'PENDING_DELIVERY_CONFIRMATION': { display: 'Pending POD', color: '#f0ad4e', group: 'active' },
        'DELIVERY_CONFIRMED': { display: 'Pending Invoicing', color: '#f0ad4e', group: 'complete' },
        'PENDING_PAYMENT': { display: 'Invoiced', color: '#5cb85c', group: 'invoiced' },
        'PAID': { display: 'Paid', color: '#5cb85c', group: 'paid' },
        'CANCELLED': { display: 'Cancelled', color: '#d9534f', group: 'cancelled' }
    });

    const DetentionPricing = Object.freeze({
        SHIPPER: Object.freeze({
            pricingCode: 'DETENTION_DRIVER_AT_SHIPPER',
            description: 'Driver Detention at Shipper Charge'
        }),
        RECEIVER: Object.freeze({
            pricingCode: 'DETENTION_DRIVER_AT_RECEIVER',
            description: 'Driver Detention at Receiver Charge'
        })
    });

    const ActionDisplayConfig = Object.freeze({
        CHARGE_ADDED: { term: 'Charge Added', icon: '✅', reportTerm: 'Charge Added', cssClass: 'added' },
        RECOVERED: { term: '🎯 Recovered', icon: '🎯', reportTerm: '🎯 Recovered', cssClass: 'recovered' },
        HOLD_RELEASED: { term: 'Hold Released', icon: '✅', reportTerm: 'Hold Released', cssClass: 'released' },
        ANALYSIS_ONLY: { term: 'Analysis Only', icon: '📊', reportTerm: 'Analysis Only', cssClass: 'analysis' },
        PENDING: { term: 'Pending', icon: '⏳', reportTerm: 'Pending', cssClass: 'pending' },
        NO_ACTION: { term: 'No Action', icon: '—', reportTerm: 'No Action', cssClass: 'no-action' },
        ERROR: { term: 'Error', icon: '❌', reportTerm: 'Error', cssClass: 'error' }
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 6: UTILITY FUNCTIONS
     * ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * Generate a unique session ID
     * @returns {string}
     */
    const generateSessionId = () =>
        `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;

    /**
     * Generate unique element ID
     * @param {string} prefix
     * @returns {string}
     */
    const generateId = (prefix = 'id') =>
        `${prefix}-${Math.random().toString(36).substring(2, 11)}-${Date.now().toString(36)}`;

    /**
     * Safe JSON stringify with circular reference handling
     * @param {*} obj
     * @param {number} indent
     * @returns {string}
     */
    const safeStringify = (obj, indent = 2) => {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (value instanceof Map) {
                return { __type: 'Map', entries: Array.from(value.entries()) };
            }
            if (value instanceof Set) {
                return { __type: 'Set', values: Array.from(value.values()) };
            }
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value;
        }, indent);
    };

    /**
     * Parse boolean from various input formats
     * @param {*} value
     * @param {boolean} defaultValue
     * @returns {boolean}
     */
    const parseBoolean = (value, defaultValue = false) => {
        if (value === null || value === undefined || value === '') return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const normalized = value.toLowerCase().trim();
            if (['true', 'yes', '1', 'on', 'enabled'].includes(normalized)) return true;
            if (['false', 'no', '0', 'off', 'disabled'].includes(normalized)) return false;
        }
        if (typeof value === 'number') return value !== 0;
        return defaultValue;
    };

    /**
     * Debounce function
     * @param {Function} func
     * @param {number} wait
     * @param {boolean} immediate
     * @returns {Function}
     */
    const debounce = (func, wait, immediate = false) => {
        let timeout;
        return function executedFunction(...args) {
            const context = this;
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };

    /**
     * Chunk array into smaller arrays
     * @param {Array} array
     * @param {number} size
     * @returns {Array<Array>}
     */
    const chunkArray = (array, size) => {
        const chunks = [];
        for (let i = 0, len = array.length; i < len; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    };

    /**
     * Sleep for specified milliseconds
     * @param {number} ms
     * @returns {Promise<void>}
     */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Compare two version strings
     * @param {string} v1
     * @param {string} v2
     * @returns {number}
     */
    const compareVersions = (v1, v2) => {
        const parts1 = String(v1).split('.').map(Number);
        const parts2 = String(v2).split('.').map(Number);
        const maxLength = Math.max(parts1.length, parts2.length);

        for (let i = 0; i < maxLength; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 < p2) return -1;
            if (p1 > p2) return 1;
        }
        return 0;
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 7: EVENT EMITTER (Dependency Injection Support)
     * ═══════════════════════════════════════════════════════════════════════════ */

    class EventEmitter {
        constructor() {
            this._events = new Map();
        }

        on(event, callback) {
            if (!this._events.has(event)) {
                this._events.set(event, new Set());
            }
            this._events.get(event).add(callback);
            return () => this.off(event, callback);
        }

        off(event, callback) {
            const listeners = this._events.get(event);
            if (listeners) {
                listeners.delete(callback);
            }
        }

        emit(event, ...args) {
            const listeners = this._events.get(event);
            if (listeners) {
                listeners.forEach(callback => {
                    try {
                        callback(...args);
                    } catch (error) {
                        console.error(`Event listener error for ${event}:`, error);
                    }
                });
            }
        }

        clear() {
            this._events.clear();
        }
    }

    // Global event bus for loose coupling
    const EventBus = new EventEmitter();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 8: TELEMETRY SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Telemetry = (() => {
        const events = [];
        const sessionId = generateSessionId();
        let flushTimeout = null;
        let isEnabled = CONFIG.FEATURES.TELEMETRY_ENABLED;

        const track = (eventType, data = {}) => {
            if (!isEnabled) return;

            events.push({
                event: eventType,
                data: { ...data, version: CONFIG.VERSION, url: window.location.hostname },
                timestamp: Date.now(),
                sessionId
            });

            while (events.length > CONFIG.TELEMETRY.MAX_EVENTS) {
                events.shift();
            }

            if (!flushTimeout) {
                flushTimeout = setTimeout(() => {
                    flush();
                    flushTimeout = null;
                }, CONFIG.TELEMETRY.FLUSH_INTERVAL);
            }
        };

        const flush = () => {
            // In production, this would send to telemetry endpoint
            if (CONFIG.FEATURES.DEBUG_MODE && events.length > 0) {
                console.debug(`D-DART Telemetry: ${events.length} events in session ${sessionId}`);
            }
        };

        const getMetrics = () => {
            const metrics = {
                sessionId,
                eventCount: events.length,
                sessionDuration: Date.now() - (events[0]?.timestamp || Date.now()),
                eventTypes: {}
            };
            events.forEach(e => {
                metrics.eventTypes[e.event] = (metrics.eventTypes[e.event] || 0) + 1;
            });
            return metrics;
        };

        const cleanup = () => {
            if (flushTimeout) {
                clearTimeout(flushTimeout);
                flushTimeout = null;
            }
            flush();
        };

        return { track, flush, getMetrics, cleanup, getSessionId: () => sessionId };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 9: PERFORMANCE MONITOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const PerformanceMonitor = (() => {
        const metrics = {
            apiCalls: 0,
            apiErrors: 0,
            avgResponseTime: 0,
            totalResponseTime: 0,
            ordersProcessed: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        return {
            recordApiCall(duration, isError = false) {
                metrics.apiCalls++;
                if (isError) {
                    metrics.apiErrors++;
                } else {
                    metrics.totalResponseTime += duration;
                    metrics.avgResponseTime = metrics.totalResponseTime / (metrics.apiCalls - metrics.apiErrors);
                }
            },
            recordOrderProcessed() { metrics.ordersProcessed++; },
            recordCacheHit() { metrics.cacheHits++; },
            recordCacheMiss() { metrics.cacheMisses++; },
            getMetrics() {
                return {
                    ...metrics,
                    cacheHitRate: metrics.cacheHits + metrics.cacheMisses > 0
                        ? ((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100).toFixed(2) + '%'
                        : 'N/A',
                    apiSuccessRate: metrics.apiCalls > 0
                        ? (((metrics.apiCalls - metrics.apiErrors) / metrics.apiCalls) * 100).toFixed(2) + '%'
                        : 'N/A'
                };
            },
            reset() {
                Object.keys(metrics).forEach(key => { metrics[key] = 0; });
            }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 10: STATE MANAGEMENT
     * ═══════════════════════════════════════════════════════════════════════════ */

    class StateManager {
        constructor() {
            this._state = {
                batchReportData: [],
                currentBatchResults: [],
                pendingApprovalOrders: [],
                isProcessing: false,
                currentOrderIds: [],
                currentIndex: 0,
                totalOrders: 0,
                batchState: BatchState.IDLE,
                processedOrders: new Map(),
                failedOrders: [],
                batchStartTime: null,
                currentChunk: 0,
                totalChunks: 0,
                isMinimized: CONFIG.START_MINIMIZED,
                isDragging: false,
                isSingleMode: false,
                singleOrderData: null,
                sowStatus: SOWStatus.NOT_LOADED,
                sowShipperCount: 0,
                sowLastError: null,
                sowLastRefresh: null,
                isSettingsOpen: false,
                settingsSearchTerm: '',
                settingsFilters: {
                    status: 'all',
                    rateType: 'all',
                    validation: 'all',
                    hideInactive: false
                },
                expandedShippers: new Set(),
                updateStatus: UpdateStatus.CHECKING,
                latestVersion: null,
                latestFileUrl: null,
                updateError: null
            };
            this._listeners = new Map();
        }

        get(key) {
            return this._state[key];
        }

        set(key, value) {
            const oldValue = this._state[key];
            this._state[key] = value;
            this._notify(key, value, oldValue);
        }

        update(updates) {
            Object.entries(updates).forEach(([key, value]) => this.set(key, value));
        }

        subscribe(key, callback) {
            if (!this._listeners.has(key)) {
                this._listeners.set(key, new Set());
            }
            this._listeners.get(key).add(callback);
            return () => this._listeners.get(key)?.delete(callback);
        }

        _notify(key, newValue, oldValue) {
            const listeners = this._listeners.get(key);
            if (listeners) {
                listeners.forEach(callback => {
                    try {
                        callback(newValue, oldValue);
                    } catch (error) {
                        console.error('State listener error:', error);
                    }
                });
            }
        }

        resetBatch() {
            this.update({
                batchReportData: [],
                currentBatchResults: [],
                pendingApprovalOrders: [],
                currentOrderIds: [],
                currentIndex: 0,
                totalOrders: 0,
                batchState: BatchState.IDLE,
                processedOrders: new Map(),
                failedOrders: [],
                batchStartTime: null,
                currentChunk: 0,
                totalChunks: 0,
                isSingleMode: false,
                singleOrderData: null
            });
        }

        addBatchReportEntry(entry) {
            this.set('batchReportData', [...this._state.batchReportData, entry]);
        }

        addPendingApprovalOrder(orderData) {
            this.set('pendingApprovalOrders', [...this._state.pendingApprovalOrders, orderData]);
        }

        addProcessedOrder(orderId, data) {
            const map = new Map(this._state.processedOrders);
            map.set(orderId, data);
            this.set('processedOrders', map);
        }

        addFailedOrder(orderId, error) {
            this.set('failedOrders', [...this._state.failedOrders, { orderId, error, timestamp: Date.now() }]);
        }

        toggleShipperExpanded(shipperName) {
            const expanded = new Set(this._state.expandedShippers);
            expanded.has(shipperName) ? expanded.delete(shipperName) : expanded.add(shipperName);
            this.set('expandedShippers', expanded);
        }

        expandAllShippers(shipperNames) {
            this.set('expandedShippers', new Set(shipperNames));
        }

        collapseAllShippers() {
            this.set('expandedShippers', new Set());
        }

        getSnapshot() {
            return {
                ...this._state,
                processedOrders: Array.from(this._state.processedOrders.entries()),
                processedOrdersCount: this._state.processedOrders.size,
                failedOrdersCount: this._state.failedOrders.length,
                expandedShippers: Array.from(this._state.expandedShippers),
                expandedShippersCount: this._state.expandedShippers.size
            };
        }

        clearListeners() {
            this._listeners.clear();
        }

        reset() {
            this.resetBatch();
            this.set('expandedShippers', new Set());
            this.set('settingsSearchTerm', '');
            this.set('settingsFilters', {
                status: 'all',
                rateType: 'all',
                validation: 'all',
                hideInactive: false
            });
        }
    }

    const AppState = new StateManager();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 11: LOGGING SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Logger = (() => {
        const logs = [];
        const errorCounts = new Map();

        const addLog = (level, message, data = null) => {
            if (!CONFIG.FEATURES.DEBUG_MODE && level === 'DEBUG') return;

            const timestamp = new Date().toISOString();
            let logEntry = `[${timestamp}] [${level}] ${message}`;

            if (data !== null) {
                try {
                    const dataStr = typeof data === 'string' ? data : safeStringify(data);
                    const truncated = dataStr.length > 500 ? dataStr.substring(0, 500) + '...[truncated]' : dataStr;
                    logEntry += `\n  DATA: ${truncated}`;
                } catch (e) {
                    logEntry += `\n  DATA: [Could not stringify]`;
                }
            }

            logs.unshift(logEntry);
            if (logs.length > CONFIG.MAX_DEBUG_LOGS) logs.pop();

            if (level === 'ERROR') {
                const key = message.substring(0, 50);
                errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
                Telemetry.track(TelemetryEventType.APP_ERROR, { message: message.substring(0, 200), level });
            }

            const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
            console[consoleMethod](`🚛 D-DART [${level}]:`, message, data || '');
        };

        return {
            debug: (message, data) => addLog('DEBUG', message, data),
            info: (message, data) => addLog('INFO', message, data),
            warn: (message, data) => addLog('WARN', message, data),
            error: (message, data) => addLog('ERROR', message, data),
            generateReport() {
                return safeStringify({
                    '=== D-DART DEBUG REPORT ===': new Date().toISOString(),
                    'Version': CONFIG.VERSION,
                    'Page URL': window.location.href,
                    'State Snapshot': AppState.getSnapshot(),
                    'Performance Metrics': PerformanceMonitor.getMetrics(),
                    'Telemetry Metrics': Telemetry.getMetrics(),
                    'Error Frequency': Object.fromEntries(errorCounts),
                    'Recent Logs': logs.slice(0, 100)
                });
            },
            getLogs: () => [...logs],
            clear() {
                logs.length = 0;
                errorCounts.clear();
            }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 12: HELPERS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Helpers = {
        escapeHtml(text) {
            if (text == null) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        },

        isOnSMC() {
            const host = window.location.hostname;
            return host.includes('smc-na-iad') || host.includes('smc.amazon.com');
        },

        formatDuration(minutes) {
            if (typeof minutes !== 'number' || isNaN(minutes)) return 'N/A';
            const absMinutes = Math.abs(minutes);
            const hours = Math.floor(absMinutes / 60);
            const mins = absMinutes % 60;
            return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        },

        formatCurrency(amount) {
            if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
            return `$${amount.toFixed(2)}`;
        },

        formatTimeFromEpoch(epochMs, timezone = 'America/Los_Angeles') {
            if (!epochMs) return '-';
            try {
                return new Date(epochMs).toLocaleString('en-US', {
                    timeZone: timezone,
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } catch (e) {
                return new Date(epochMs).toLocaleString();
            }
        },

        formatDelta(deltaMinutes) {
            if (deltaMinutes === null || deltaMinutes === undefined) return '-';
            const absMinutes = Math.abs(deltaMinutes);
            const sign = deltaMinutes >= 0 ? '+' : '-';
            if (absMinutes >= 60) {
                const hours = Math.floor(absMinutes / 60);
                const mins = absMinutes % 60;
                return `${sign}${hours}h ${mins}m`;
            }
            return `${sign}${absMinutes}m`;
        },

        formatETA(ms) {
            if (ms < 60000) return '< 1 minute';
            if (ms < 3600000) return `~${Math.ceil(ms / 60000)} minutes`;
            const hours = Math.floor(ms / 3600000);
            const mins = Math.ceil((ms % 3600000) / 60000);
            return `~${hours}h ${mins}m`;
        },

        formatElapsed(ms) {
            if (ms < 60000) return `${Math.round(ms / 1000)}s`;
            if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
            const hours = Math.floor(ms / 3600000);
            const mins = Math.floor((ms % 3600000) / 60000);
            return `${hours}h ${mins}m`;
        },

        formatRelativeTime(timestamp) {
            if (!timestamp) return 'Never';
            const diff = Date.now() - timestamp;
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)} hour(s) ago`;
            return `${Math.floor(diff / 86400000)} day(s) ago`;
        },

        truncateText(text, maxLength = 30) {
            if (!text || text.length <= maxLength) return text || '';
            return text.substring(0, maxLength - 3) + '...';
        },

        async copyToClipboard(text) {
            try {
                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(text);
                    return;
                }
            } catch (e) { /* fallthrough */ }

            if (navigator.clipboard?.writeText) {
                return navigator.clipboard.writeText(text);
            }

            return new Promise((resolve, reject) => {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                success ? resolve() : reject(new Error(Messages.ERRORS.COPY_FAILED));
            });
        },

        downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        formatValueOrDash(value) {
            return (value === null || value === undefined || value === '') ? '-' : String(value);
        },

        formatBoolean(value) {
            const parsed = parseBoolean(value, null);
            if (parsed === true) return 'Yes';
            if (parsed === false) return 'No';
            return '-';
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 13: SECURITY HELPERS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const SecurityHelpers = {
        sanitizeUrl(url) {
            if (!url) return '#';
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== 'https:') return '#';
                const isAllowed = CONFIG.ALLOWED_DOMAINS.some(domain => parsed.hostname.includes(domain));
                return isAllowed ? url : '#';
            } catch (e) {
                return '#';
            }
        },

        buildSMCOrderUrl(orderId) {
            if (!orderId) return '#';
            return this.sanitizeUrl(`${CONFIG.URLS.SMC_ORDER}/${encodeURIComponent(orderId)}`);
        },

        buildFMCSearchUrl(searchId) {
            if (!searchId) return '#';
            return this.sanitizeUrl(`${CONFIG.URLS.FMC_SEARCH}/${encodeURIComponent(searchId)}`);
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 14: VALIDATION SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Validator = {
        isValidOrderId(id) {
            if (!id || typeof id !== 'string') return false;
            const trimmed = id.trim();
            if (trimmed.length < CONFIG.VALIDATION.ORDER_ID_MIN_LENGTH ||
                trimmed.length > CONFIG.VALIDATION.ORDER_ID_MAX_LENGTH) return false;
            return CONFIG.VALIDATION.ORDER_ID_PATTERN.test(trimmed);
        },

        parseOrderIds(input) {
            const result = { valid: true, errors: [], sanitized: [], duplicatesRemoved: 0 };

            if (!input || typeof input !== 'string') {
                result.valid = false;
                result.errors.push('Input is required');
                return result;
            }

            const rawIds = input.split(/[,\s\n]+/).map(id => id.trim()).filter(id => id.length > 0);
            if (rawIds.length === 0) {
                result.valid = false;
                result.errors.push('No order IDs found in input');
                return result;
            }

            const uniqueIds = [...new Set(rawIds)];
            result.duplicatesRemoved = rawIds.length - uniqueIds.length;

            for (const id of uniqueIds) {
                if (this.isValidOrderId(id)) {
                    result.sanitized.push(id);
                } else {
                    result.errors.push(`Invalid order ID: ${id}`);
                }
            }

            if (result.sanitized.length === 0) result.valid = false;
            return result;
        },

        sanitizeAuthNumber(authNumber) {
            if (!authNumber || typeof authNumber !== 'string') return null;
            const trimmed = authNumber.trim();
            return trimmed.length > 0 ? trimmed.substring(0, CONFIG.VALIDATION.AUTH_NUMBER_MAX_LENGTH) : null;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 15: LRU CACHE MANAGER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const CacheManager = (() => {
        const cache = new Map();
        let cleanupInterval = null;

        const startCleanup = () => {
            if (cleanupInterval) return;
            cleanupInterval = setInterval(() => {
                const now = Date.now();
                let cleaned = 0;
                for (const [key, value] of cache.entries()) {
                    if (now - value.time > value.duration) {
                        cache.delete(key);
                        cleaned++;
                    }
                }
                if (cleaned > 0) Logger.debug(`Cache cleanup: removed ${cleaned} entries`);
            }, CONFIG.CACHE.CLEANUP_INTERVAL);
        };

        const stopCleanup = () => {
            if (cleanupInterval) {
                clearInterval(cleanupInterval);
                cleanupInterval = null;
            }
        };

        return {
            add(id, data, customDuration = null) {
                // LRU eviction
                if (cache.size >= CONFIG.CACHE.MAX_SIZE) {
                    let oldestKey = null;
                    let oldestTime = Infinity;
                    for (const [key, value] of cache.entries()) {
                        if (value.lastAccess < oldestTime) {
                            oldestTime = value.lastAccess;
                            oldestKey = key;
                        }
                    }
                    if (oldestKey) cache.delete(oldestKey);
                }
                cache.set(id, {
                    data,
                    time: Date.now(),
                    lastAccess: Date.now(),
                    duration: customDuration || CONFIG.CACHE.DURATION
                });
                startCleanup();
            },

            get(id) {
                const cached = cache.get(id);
                if (cached) {
                    if (Date.now() - cached.time < cached.duration) {
                        cached.lastAccess = Date.now();
                        PerformanceMonitor.recordCacheHit();
                        return cached.data;
                    }
                    cache.delete(id);
                }
                PerformanceMonitor.recordCacheMiss();
                return null;
            },

            has(id) {
                const cached = cache.get(id);
                if (cached && Date.now() - cached.time < cached.duration) return true;
                return false;
            },

            invalidate(id) { cache.delete(id); },
            clear() { cache.clear(); stopCleanup(); },
            getStats() { return { size: cache.size, maxSize: CONFIG.CACHE.MAX_SIZE }; },
            cleanup() { stopCleanup(); cache.clear(); }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 16: PROGRESS PERSISTENCE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ProgressManager = (() => {
        let saveThrottleTimeout = null;

        return {
            save(data) {
                if (saveThrottleTimeout) return true;
                try {
                    const payload = { ...data, timestamp: Date.now(), version: CONFIG.VERSION, sessionId: Telemetry.getSessionId() };
                    GM_setValue(CONFIG.BATCH.STORAGE_KEY, safeStringify(payload));
                    saveThrottleTimeout = setTimeout(() => { saveThrottleTimeout = null; }, CONFIG.PROGRESS.SAVE_THROTTLE);
                    return true;
                } catch (e) {
                    Logger.warn('Failed to save progress', e.message);
                    return false;
                }
            },

            load() {
                try {
                    const saved = GM_getValue(CONFIG.BATCH.STORAGE_KEY, null);
                    if (!saved) return null;
                    const data = JSON.parse(saved);
                    if (Date.now() - data.timestamp > CONFIG.PROGRESS.MAX_AGE || data.version !== CONFIG.VERSION) {
                        this.clear();
                        return null;
                    }
                    return data;
                } catch (e) {
                    return null;
                }
            },

            clear() {
                try {
                    GM_setValue(CONFIG.BATCH.STORAGE_KEY, null);
                    if (saveThrottleTimeout) {
                        clearTimeout(saveThrottleTimeout);
                        saveThrottleTimeout = null;
                    }
                } catch (e) { /* ignore */ }
            },

            hasProgress() { return this.load() !== null; }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 17: CIRCUIT BREAKER
     * ═══════════════════════════════════════════════════════════════════════════ */

    class CircuitBreaker {
        constructor(name) {
            this.name = name;
            this.state = CircuitBreakerState.CLOSED;
            this.failureCount = 0;
            this.successCount = 0;
            this.nextAttemptTime = null;
            this.lastError = null;
        }

        canExecute() {
            if (this.state === CircuitBreakerState.CLOSED) return true;
            if (this.state === CircuitBreakerState.OPEN) {
                if (Date.now() >= this.nextAttemptTime) {
                    this.state = CircuitBreakerState.HALF_OPEN;
                    this.successCount = 0;
                    return true;
                }
                throw new Error(Messages.ERRORS.CIRCUIT_BREAKER_OPEN);
            }
            return true;
        }

        recordSuccess() {
            this.failureCount = 0;
            this.lastError = null;
            if (this.state === CircuitBreakerState.HALF_OPEN) {
                this.successCount++;
                if (this.successCount >= CONFIG.CIRCUIT_BREAKER.SUCCESS_THRESHOLD) {
                    this.state = CircuitBreakerState.CLOSED;
                    Logger.info(`Circuit ${this.name} closed`);
                }
            }
        }

        recordFailure(error = null) {
            this.failureCount++;
            this.lastError = error;
            if (this.state === CircuitBreakerState.HALF_OPEN ||
                this.failureCount >= CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
                this.state = CircuitBreakerState.OPEN;
                this.nextAttemptTime = Date.now() + CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT;
                Logger.warn(`Circuit ${this.name} opened`);
            }
        }

        reset() {
            this.state = CircuitBreakerState.CLOSED;
            this.failureCount = 0;
            this.successCount = 0;
            this.nextAttemptTime = null;
            this.lastError = null;
        }

        getState() {
            return { name: this.name, state: this.state, failureCount: this.failureCount };
        }
    }

    const circuitBreakers = {
        smc: new CircuitBreaker('SMC'),
        fmc: new CircuitBreaker('FMC'),
        execution: new CircuitBreaker('Execution'),
        sharepoint: new CircuitBreaker('SharePoint'),
        github: new CircuitBreaker('GitHub')
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 18: ERROR HANDLER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ErrorHandler = {
        create(type, message, context = {}) {
            const error = new Error(message);
            error.type = type;
            error.context = context;
            error.timestamp = Date.now();
            error.id = generateId('err');
            return error;
        },

        handle(error, fallback = null, showToast = true) {
            const errorType = error.type || ErrorType.UNKNOWN;
            Logger.error(error.message, { type: errorType, context: error.context, id: error.id });
            if (showToast) {
                EventBus.emit('showToast', this._getUserMessage(errorType, error.message), 'error');
            }
            return fallback;
        },

        async wrap(asyncFn, errorType, fallback = null, showToast = true) {
            try {
                return await asyncFn();
            } catch (error) {
                if (error.type) return this.handle(error, fallback, showToast);
                const typedError = this.create(errorType, error.message, { originalError: error.stack });
                return this.handle(typedError, fallback, showToast);
            }
        },

        isRateLimitError(error) {
            const msg = error?.message?.toLowerCase() || '';
            return error?.type === ErrorType.RATE_LIMIT || msg.includes('429') || msg.includes('rate');
        },

        isRetryableError(error) {
            return error?.type === ErrorType.NETWORK || error?.type === ErrorType.TIMEOUT ||
                   error?.type === ErrorType.RATE_LIMIT || this.isRateLimitError(error);
        },

        _getUserMessage(errorType, originalMessage) {
            const messages = {
                [ErrorType.NETWORK]: Messages.ERRORS.NETWORK_ERROR,
                [ErrorType.AUTH]: Messages.ERRORS.AUTH_ERROR,
                [ErrorType.VALIDATION]: originalMessage,
                [ErrorType.BUSINESS]: originalMessage,
                [ErrorType.TIMEOUT]: Messages.ERRORS.TIMEOUT_ERROR,
                [ErrorType.PARSE]: Messages.ERRORS.PARSE_ERROR,
                [ErrorType.RATE_LIMIT]: Messages.ERRORS.RATE_LIMITED,
                [ErrorType.CIRCUIT_BREAKER]: Messages.ERRORS.CIRCUIT_BREAKER_OPEN,
                [ErrorType.SOW]: originalMessage,
                [ErrorType.UPDATE]: Messages.ERRORS.UPDATE_CHECK_FAILED,
                [ErrorType.UNKNOWN]: Messages.ERRORS.UNKNOWN_ERROR
            };
            return messages[errorType] || messages[ErrorType.UNKNOWN];
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 19: GM REQUEST WRAPPER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const GMRequest = {
        async fetch(options) {
            const startTime = performance.now();

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: options.url,
                    headers: options.headers || {},
                    data: options.body || null,
                    responseType: options.responseType || 'json',
                    withCredentials: options.withCredentials !== false,
                    timeout: options.timeout || CONFIG.API.REQUEST_TIMEOUT,
                    onload: (response) => {
                        const duration = performance.now() - startTime;
                        if (response.status >= 200 && response.status < 300) {
                            PerformanceMonitor.recordApiCall(duration, false);
                            let data = response.response;
                            if (typeof data === 'string' && options.responseType === 'json') {
                                try { data = JSON.parse(data); }
                                catch (e) { reject(ErrorHandler.create(ErrorType.PARSE, 'JSON parse failed')); return; }
                            }
                            resolve(data);
                        } else if (response.status === 401 || response.status === 403) {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.AUTH_ERROR));
                        } else if (response.status === 429) {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.RATE_LIMIT, Messages.ERRORS.RATE_LIMITED));
                        } else {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.NETWORK, `HTTP ${response.status}`));
                        }
                    },
                    onerror: () => {
                        PerformanceMonitor.recordApiCall(performance.now() - startTime, true);
                        reject(ErrorHandler.create(ErrorType.NETWORK, Messages.ERRORS.NETWORK_ERROR));
                    },
                    ontimeout: () => {
                        PerformanceMonitor.recordApiCall(performance.now() - startTime, true);
                        reject(ErrorHandler.create(ErrorType.TIMEOUT, Messages.ERRORS.TIMEOUT_ERROR));
                    }
                });
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 20: HTTP CLIENT WITH RETRY
     * ═══════════════════════════════════════════════════════════════════════════ */

    const HttpClient = {
        async request(options, context = 'API', circuitBreaker = null) {
            if (circuitBreaker) circuitBreaker.canExecute();

            for (let attempt = 0; attempt <= CONFIG.API.MAX_RETRIES; attempt++) {
                try {
                    const result = await GMRequest.fetch(options);
                    if (circuitBreaker) circuitBreaker.recordSuccess();
                    return result;
                } catch (error) {
                    if (circuitBreaker) circuitBreaker.recordFailure(error);
                    const isLastAttempt = attempt === CONFIG.API.MAX_RETRIES;
                    const isRetryable = ErrorHandler.isRetryableError(error);

                    if (isLastAttempt || !isRetryable) throw error;

                    let delay = Math.min(
                        CONFIG.API.RETRY_BASE_DELAY * Math.pow(2, attempt) + Math.random() * 200,
                        CONFIG.API.RETRY_MAX_DELAY
                    );
                    if (ErrorHandler.isRateLimitError(error)) delay *= CONFIG.API.RATE_LIMIT_MULTIPLIER;
                    await sleep(delay);
                }
            }
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 21: TOKEN MANAGER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const TokenManager = (() => {
        let token = null;
        let tokenTime = 0;
        let isFetching = false;
        let fetchPromise = null;
        let countdownInterval = null;
        let autoRefreshInterval = null;

        const save = (newToken) => {
            token = newToken;
            tokenTime = Date.now();
            try {
                GM_setValue(CONFIG.TOKEN.STORAGE_KEY, token);
                GM_setValue(CONFIG.TOKEN.TIME_KEY, tokenTime);
            } catch (e) { Logger.error('Token save error', e.message); }
        };

        const extractFromPage = () => {
            const selectors = ['meta[name="x-csrf-token"]', 'meta[name="csrf-token"]'];
            for (const selector of selectors) {
                const meta = document.querySelector(selector);
                if (meta?.content) return meta.content;
            }
            return null;
        };

        const loadFromStorage = () => {
            try {
                const saved = GM_getValue(CONFIG.TOKEN.STORAGE_KEY, null);
                const time = GM_getValue(CONFIG.TOKEN.TIME_KEY, 0);
                if (saved && time) {
                    token = saved;
                    tokenTime = time;
                    return true;
                }
            } catch (e) { Logger.error('Token load error', e.message); }
            return false;
        };

        const isExpired = () => !token || !tokenTime || (Date.now() - tokenTime) > CONFIG.TOKEN.MAX_AGE;

        const getRemainingSeconds = () => {
            if (!token || !tokenTime) return 0;
            const elapsed = Date.now() - tokenTime;
            return Math.max(0, Math.ceil((CONFIG.TOKEN.MAX_AGE - elapsed) / 1000));
        };

        const getStatus = () => {
            const remainingSeconds = getRemainingSeconds();
            if (isFetching) return { status: 'fetching', text: '⏳', class: CSS_CLASSES.TOKEN_FETCHING, remainingSeconds: 0 };
            if (!token) return { status: 'missing', text: '❌', class: CSS_CLASSES.ERROR, remainingSeconds: 0 };
            if (isExpired()) return { status: 'expired', text: '❌', class: CSS_CLASSES.ERROR, remainingSeconds: 0 };
            if (remainingSeconds <= CONFIG.TOKEN.CRITICAL_THRESHOLD)
                return { status: 'critical', text: `⚠️ ${remainingSeconds}s`, class: CSS_CLASSES.TOKEN_CRITICAL, remainingSeconds };
            if (remainingSeconds <= CONFIG.TOKEN.WARNING_THRESHOLD)
                return { status: 'warning', text: `✓ ${remainingSeconds}s`, class: CSS_CLASSES.TOKEN_WARNING, remainingSeconds };
            return { status: 'ready', text: `✓ ${remainingSeconds}s`, class: CSS_CLASSES.TOKEN_READY, remainingSeconds };
        };

        const startCountdown = () => {
            stopCountdown();
            countdownInterval = setInterval(() => {
                EventBus.emit('tokenUpdate');
            }, CONFIG.TOKEN.UPDATE_INTERVAL);
        };

        const stopCountdown = () => {
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        };

        const startAutoRefresh = () => {
            stopAutoRefresh();
            autoRefreshInterval = setInterval(async () => {
                if (getRemainingSeconds() < CONFIG.TOKEN.WARNING_THRESHOLD) {
                    await ensure();
                }
            }, CONFIG.TOKEN.REFRESH_INTERVAL);
        };

        const stopAutoRefresh = () => {
            if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
        };

        const doFetch = () => {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: CONFIG.URLS.SMC_BASE,
                    headers: { 'Accept': 'text/html' },
                    withCredentials: true,
                    timeout: CONFIG.TOKEN.FETCH_TIMEOUT,
                    onload: (response) => {
                        if (response.status === 200) {
                            const patterns = [
                                /<meta[^>]+name=["']x-csrf-token["'][^>]+content=["']([^"']+)["']/i,
                                /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']x-csrf-token["']/i
                            ];
                            let foundToken = null;
                            for (const pattern of patterns) {
                                const match = response.responseText.match(pattern);
                                if (match?.[1]) { foundToken = match[1]; break; }
                            }
                            if (foundToken) {
                                save(foundToken);
                                startCountdown();
                                Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: true });
                                EventBus.emit('tokenUpdate');
                                resolve(true);
                            } else {
                                Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: false, reason: 'not_found' });
                                resolve(false);
                            }
                        } else {
                            resolve(false);
                        }
                    },
                    onerror: () => resolve(false),
                    ontimeout: () => resolve(false)
                });
            });
        };

        const ensure = async () => {
            if (Helpers.isOnSMC()) {
                const pageToken = extractFromPage();
                if (pageToken) {
                    save(pageToken);
                    startCountdown();
                    return true;
                }
            }

            if (token && !isExpired()) return true;

            if (isFetching && fetchPromise) return await fetchPromise;

            isFetching = true;
            EventBus.emit('tokenUpdate');

            fetchPromise = doFetch();
            try {
                return await fetchPromise;
            } finally {
                isFetching = false;
                fetchPromise = null;
                EventBus.emit('tokenUpdate');
            }
        };

        const clear = () => {
            token = null;
            tokenTime = 0;
            stopCountdown();
            stopAutoRefresh();
            try {
                GM_setValue(CONFIG.TOKEN.STORAGE_KEY, null);
                GM_setValue(CONFIG.TOKEN.TIME_KEY, 0);
            } catch (e) { Logger.error('Token clear error', e.message); }
        };

        const init = () => {
            if (Helpers.isOnSMC()) {
                const pageToken = extractFromPage();
                if (pageToken) {
                    save(pageToken);
                    startCountdown();
                    return true;
                }
            }
            const loaded = loadFromStorage();
            if (loaded) startCountdown();
            return loaded;
        };

        return {
            init,
            ensure,
            getToken: () => token,
            getStatus,
            getRemainingSeconds,
            isExpired,
            startAutoRefresh,
            stopAutoRefresh,
            clear,
            cleanup() {
                stopCountdown();
                stopAutoRefresh();
            }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 22: VERSION CHECKER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const VersionChecker = (() => {
        let isChecking = false;
        let checkPromise = null;

        const extractVersionFromFilename = (filename) => {
            const match = filename.match(CONFIG.GITHUB.FILENAME_PATTERN);
            return match?.[1] || null;
        };

        const findLatestVersionFile = (files) => {
            let latestVersion = null;
            let latestFile = null;

            for (const file of files) {
                if (file.type !== 'file') continue;
                const version = extractVersionFromFilename(file.name);
                if (!version) continue;
                if (!latestVersion || compareVersions(version, latestVersion) > 0) {
                    latestVersion = version;
                    latestFile = file;
                }
            }
            return latestFile ? { version: latestVersion, file: latestFile } : null;
        };

        const fetchRepositoryContents = async () => {
            const response = await GMRequest.fetch({
                method: 'GET',
                url: CONFIG.GITHUB.API_URL,
                headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': `D-DART/${CONFIG.VERSION}` },
                timeout: CONFIG.GITHUB.REQUEST_TIMEOUT,
                withCredentials: false
            });
            if (!Array.isArray(response)) {
                throw ErrorHandler.create(ErrorType.PARSE, 'Invalid GitHub API response');
            }
            return response;
        };

        const buildRawUrl = (filename) => {
            return `${CONFIG.GITHUB.RAW_BASE_URL}/${encodeURIComponent(filename)}`;
        };

        const checkWithRetry = async (attempt = 1) => {
            try {
                const files = await fetchRepositoryContents();
                const latest = findLatestVersionFile(files);

                if (!latest) {
                    return { success: false, updateRequired: false, latestVersion: null, latestFileUrl: null, error: Messages.ERRORS.NO_SCRIPT_FILES_FOUND };
                }

                const currentVersion = CONFIG.VERSION;
                const latestVersion = latest.version;
                const versionsMatch = compareVersions(currentVersion, latestVersion) === 0;

                return {
                    success: true,
                    updateRequired: !versionsMatch,
                    latestVersion,
                    latestFileUrl: buildRawUrl(latest.file.name),
                    error: null
                };
            } catch (error) {
                if (attempt < CONFIG.GITHUB.RETRY_ATTEMPTS) {
                    await sleep(CONFIG.GITHUB.RETRY_DELAY);
                    return checkWithRetry(attempt + 1);
                }
                return { success: false, updateRequired: false, latestVersion: null, latestFileUrl: null, error: error.message };
            }
        };

        return {
            async check() {
                if (isChecking && checkPromise) return checkPromise;

                isChecking = true;
                AppState.set('updateStatus', UpdateStatus.CHECKING);

                checkPromise = checkWithRetry();

                try {
                    const result = await checkPromise;

                    Telemetry.track(TelemetryEventType.UPDATE_CHECK, {
                        success: result.success,
                        updateRequired: result.updateRequired,
                        currentVersion: CONFIG.VERSION,
                        latestVersion: result.latestVersion
                    });

                    if (result.success) {
                        AppState.update({
                            updateStatus: result.updateRequired ? UpdateStatus.UPDATE_REQUIRED : UpdateStatus.UP_TO_DATE,
                            latestVersion: result.latestVersion,
                            latestFileUrl: result.latestFileUrl,
                            updateError: null
                        });
                    } else {
                        AppState.update({
                            updateStatus: UpdateStatus.ERROR,
                            latestVersion: null,
                            latestFileUrl: null,
                            updateError: result.error
                        });
                    }

                    return result;
                } finally {
                    isChecking = false;
                    checkPromise = null;
                }
            },

            getStatus() {
                return {
                    isChecking,
                    updateStatus: AppState.get('updateStatus'),
                    latestVersion: AppState.get('latestVersion'),
                    latestFileUrl: AppState.get('latestFileUrl'),
                    updateError: AppState.get('updateError'),
                    currentVersion: CONFIG.VERSION
                };
            },

            isUpdateRequired: () => AppState.get('updateStatus') === UpdateStatus.UPDATE_REQUIRED,
            hasError: () => AppState.get('updateStatus') === UpdateStatus.ERROR,
            getUpdateUrl: () => AppState.get('latestFileUrl')
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 23: UPDATE BLOCKER UI
     * ═══════════════════════════════════════════════════════════════════════════ */

    const UpdateBlocker = (() => {
        let blockerElement = null;
        let isBlocking = false;

        const getBlockerStyles = () => `
            #d-dart-update-blocker {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.85) !important;
                z-index: 2147483647 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: 'Amazon Ember', 'Segoe UI', Tahoma, sans-serif !important;
            }
            .d-dart-update-popup {
                background: #232F3E !important;
                border: 3px solid #FF9900 !important;
                border-radius: 16px !important;
                padding: 0 !important;
                max-width: 450px !important;
                width: 90% !important;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
                animation: d-dart-popup-appear 0.3s ease-out !important;
                overflow: hidden !important;
            }
            @keyframes d-dart-popup-appear {
                from { opacity: 0; transform: scale(0.9) translateY(-20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .d-dart-update-header {
                background: linear-gradient(135deg, #FF9900 0%, #E88B00 100%) !important;
                padding: 20px 24px !important;
                text-align: center !important;
            }
            .d-dart-update-title {
                font-size: 22px !important;
                font-weight: 700 !important;
                color: #232F3E !important;
                margin: 0 !important;
            }
            .d-dart-update-body { padding: 24px !important; }
            .d-dart-version-comparison {
                background: #1a242f !important;
                border-radius: 10px !important;
                padding: 20px !important;
                margin-bottom: 20px !important;
            }
            .d-dart-version-row {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                padding: 12px 0 !important;
                border-bottom: 1px solid #37475A !important;
            }
            .d-dart-version-row:last-child { border-bottom: none !important; }
            .d-dart-version-label { font-size: 14px !important; color: #888 !important; }
            .d-dart-version-value { font-size: 18px !important; font-weight: 700 !important; font-family: monospace !important; }
            .d-dart-version-value.current { color: #ff6b6b !important; }
            .d-dart-version-value.latest { color: #00ff88 !important; }
            .d-dart-update-message {
                text-align: center !important;
                color: #FFF !important;
                font-size: 14px !important;
                line-height: 1.6 !important;
                margin-bottom: 24px !important;
            }
            .d-dart-update-message.error { color: #ff6b6b !important; }
            .d-dart-update-button {
                display: block !important;
                width: 100% !important;
                padding: 16px 24px !important;
                background: linear-gradient(135deg, #FF9900 0%, #E88B00 100%) !important;
                border: none !important;
                border-radius: 8px !important;
                color: #232F3E !important;
                font-size: 16px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                text-decoration: none !important;
                text-align: center !important;
            }
            .d-dart-update-button:hover { transform: translateY(-2px) !important; background: linear-gradient(135deg, #FFB340 0%, #FF9900 100%) !important; }
            .d-dart-update-button.retry { background: linear-gradient(135deg, #37475A 0%, #485769 100%) !important; color: #FFF !important; }
            .d-dart-update-footer {
                padding: 16px 24px !important;
                background: #1a242f !important;
                text-align: center !important;
                font-size: 11px !important;
                color: #666 !important;
            }
            .d-dart-update-footer a { color: #FF9900 !important; text-decoration: none !important; }
            .d-dart-spinner {
                display: inline-block !important;
                width: 20px !important;
                height: 20px !important;
                border: 3px solid rgba(255, 255, 255, 0.3) !important;
                border-top-color: #FFF !important;
                border-radius: 50% !important;
                animation: d-dart-spin 0.8s linear infinite !important;
                margin-right: 10px !important;
            }
            @keyframes d-dart-spin { to { transform: rotate(360deg); } }
            .d-dart-checking-text {
                color: #FFF !important;
                font-size: 16px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
        `;

        const injectStyles = () => {
            const styleId = 'd-dart-update-blocker-styles';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = getBlockerStyles();
                document.head.appendChild(style);
            }
        };

        const createBlocker = () => {
            if (blockerElement) return;
            injectStyles();
            blockerElement = document.createElement('div');
            blockerElement.id = 'd-dart-update-blocker';
            blockerElement.setAttribute('role', 'alertdialog');
            blockerElement.setAttribute('aria-modal', 'true');
            document.body.appendChild(blockerElement);
        };

        const removeBlocker = () => {
            if (blockerElement) {
                blockerElement.remove();
                blockerElement = null;
            }
            isBlocking = false;
        };

        return {
            showChecking() {
                createBlocker();
                blockerElement.innerHTML = `
                    <div class="d-dart-update-popup">
                        <div class="d-dart-update-header">
                            <h2 class="d-dart-update-title">🚛 D-DART</h2>
                        </div>
                        <div class="d-dart-update-body">
                            <div class="d-dart-checking-text">
                                <span class="d-dart-spinner"></span>
                                ${Messages.UPDATE.CHECKING}
                            </div>
                        </div>
                        <div class="d-dart-update-footer">v${CONFIG.VERSION} • ${CONFIG.AUTHOR}</div>
                    </div>
                `;
                isBlocking = true;
            },

            showUpdateRequired(currentVersion, latestVersion, updateUrl) {
                createBlocker();
                const isDowngrade = compareVersions(currentVersion, latestVersion) > 0;
                const message = isDowngrade ? Messages.UPDATE.DOWNGRADE_REQUIRED_MSG : Messages.UPDATE.UPDATE_REQUIRED_MSG;

                blockerElement.innerHTML = `
                    <div class="d-dart-update-popup">
                        <div class="d-dart-update-header">
                            <h2 class="d-dart-update-title">${Messages.UPDATE.TITLE}</h2>
                        </div>
                        <div class="d-dart-update-body">
                            <div class="d-dart-version-comparison">
                                <div class="d-dart-version-row">
                                    <span class="d-dart-version-label">${Messages.UPDATE.YOUR_VERSION}:</span>
                                    <span class="d-dart-version-value current">v${Helpers.escapeHtml(currentVersion)}</span>
                                </div>
                                <div class="d-dart-version-row">
                                    <span class="d-dart-version-label">${Messages.UPDATE.LATEST_VERSION}:</span>
                                    <span class="d-dart-version-value latest">v${Helpers.escapeHtml(latestVersion)}</span>
                                </div>
                            </div>
                            <p class="d-dart-update-message">${message}</p>
                            <a href="${Helpers.escapeHtml(updateUrl)}" class="d-dart-update-button" id="d-dart-update-btn">
                                ${Messages.UPDATE.UPDATE_BUTTON}
                            </a>
                        </div>
                        <div class="d-dart-update-footer">
                            <a href="https://github.com/${CONFIG.GITHUB.USERNAME}/${CONFIG.GITHUB.REPOSITORY}" target="_blank" rel="noopener noreferrer">View on GitHub</a>
                        </div>
                    </div>
                `;
                isBlocking = true;
            },

            showError(errorMessage, retryCallback) {
                createBlocker();
                blockerElement.innerHTML = `
                    <div class="d-dart-update-popup">
                        <div class="d-dart-update-header">
                            <h2 class="d-dart-update-title">${Messages.UPDATE.TITLE_ERROR}</h2>
                        </div>
                        <div class="d-dart-update-body">
                            <div class="d-dart-version-comparison">
                                <div class="d-dart-version-row">
                                    <span class="d-dart-version-label">Status:</span>
                                    <span class="d-dart-version-value current">❌ Connection Failed</span>
                                </div>
                            </div>
                            <p class="d-dart-update-message error">${Messages.UPDATE.CONNECTION_ERROR_MSG}</p>
                            <button class="d-dart-update-button retry" id="d-dart-retry-btn">${Messages.UPDATE.RETRY_BUTTON}</button>
                        </div>
                        <div class="d-dart-update-footer">Error: ${Helpers.escapeHtml(errorMessage || 'Unknown')}</div>
                    </div>
                `;

                const retryBtn = document.getElementById('d-dart-retry-btn');
                if (retryBtn && retryCallback) {
                    retryBtn.addEventListener('click', retryCallback);
                }
                isBlocking = true;
            },

            hide() { removeBlocker(); },
            isBlocking: () => isBlocking
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 24: SOW CONFIG MANAGER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const SOWConfigManager = (() => {
        let configMap = new Map();
        let allShippersData = [];
        let lastFetchTime = 0;
        let isLoading = false;
        let loadingPromise = null;

        const REQUIRED_FIELDS = [
            'Title', 'Rate', 'RateUnit', 'MaxCharge',
            'PU_Live_Eligible', 'PU_Live_FreeTime', 'PU_DropHook_Eligible', 'PU_DropHook_FreeTime',
            'DO_Live_Eligible', 'DO_Live_FreeTime', 'DO_DropHook_Eligible', 'DO_DropHook_FreeTime'
        ];

        const validateRequiredFields = (item) => {
            const errors = [];
            const missingFields = [];

            for (const field of REQUIRED_FIELDS) {
                const value = item[field];
                if (value === null || value === undefined || value === '') {
                    errors.push(`Missing: ${field}`);
                    missingFields.push(field);
                    continue;
                }

                if (field === 'Title' && (typeof value !== 'string' || value.trim() === '')) {
                    errors.push(`${field}: Must be non-empty text`);
                }
                if (field === 'Rate' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
                    errors.push(`${field}: Must be a positive number`);
                }
                if (field === 'RateUnit' && !['HOUR', 'MINUTE'].includes(String(value).toUpperCase())) {
                    errors.push(`${field}: Must be "Hour" or "Minute"`);
                }
                if (field === 'MaxCharge' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
                    errors.push(`${field}: Must be a positive number`);
                }
                if (field.includes('FreeTime') && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
                    errors.push(`${field}: Must be a non-negative number`);
                }
            }

            return { isValid: errors.length === 0, errors, missingFields };
        };

        const parseResponse = (response) => {
            const validMap = new Map();
            const allShippers = [];

            if (!response?.d?.results || !Array.isArray(response.d.results)) {
                throw ErrorHandler.create(ErrorType.PARSE, 'Invalid SharePoint response structure');
            }

            const items = response.d.results;

            for (const item of items) {
                const shipperName = item.Title || 'Unknown';
                const validation = validateRequiredFields(item);
                const isActive = parseBoolean(item.IsActive, true);

                let status = ShipperStatus.ACTIVE;
                if (!validation.isValid) status = ShipperStatus.VALIDATION_ERROR;
                else if (!isActive) status = ShipperStatus.INACTIVE;

                const shipperData = {
                    shipperName,
                    status,
                    isActive,
                    validationErrors: validation.errors,
                    missingFields: validation.missingFields,
                    rawData: { ...item }
                };

                allShippers.push(shipperData);

                if (validation.isValid) {
                    const rateUnit = String(item.RateUnit || 'Hour').toUpperCase();
                    const config = {
                        shipperName,
                        rate: parseFloat(item.Rate),
                        rateUnit: rateUnit === 'MINUTE' ? 'MINUTE' : 'HOUR',
                        maxCharge: parseFloat(item.MaxCharge),
                        billingIncrement: item.BillingIncrement ? parseFloat(item.BillingIncrement) : null,
                        roundingRule: item.RoundingRule ? String(item.RoundingRule).toUpperCase() : null,
                        roundDownMaxMinutes: item.RoundDownMaxMinutes ? parseFloat(item.RoundDownMaxMinutes) : null,
                        requiresApproval: parseBoolean(item.RequiresApproval, false),
                        autoChargeAllowed: parseBoolean(item.AutoChargeAllowed, false),
                        authNumberRequired: parseBoolean(item.AuthNumberRequired, false),
                        isActive,
                        notes: item.Notes || '',
                        isComplete: true,
                        rules: {
                            PICKUP: {
                                LIVE: { eligible: parseBoolean(item.PU_Live_Eligible, false), freeTime: parseFloat(item.PU_Live_FreeTime) || 0 },
                                DROP_HOOK: { eligible: parseBoolean(item.PU_DropHook_Eligible, false), freeTime: parseFloat(item.PU_DropHook_FreeTime) || 0 }
                            },
                            DROP_OFF: {
                                LIVE: { eligible: parseBoolean(item.DO_Live_Eligible, false), freeTime: parseFloat(item.DO_Live_FreeTime) || 0 },
                                DROP_HOOK: { eligible: parseBoolean(item.DO_DropHook_Eligible, false), freeTime: parseFloat(item.DO_DropHook_FreeTime) || 0 }
                            }
                        },
                        displayInfo: {
                            rate: rateUnit === 'MINUTE' ? `$${item.Rate}/min` : `$${item.Rate}/hr`,
                            max: `$${item.MaxCharge}`,
                            billingIncrement: item.BillingIncrement ? `${item.BillingIncrement} min` : '-'
                        }
                    };
                    validMap.set(shipperName, config);
                }
            }

            return { validMap, allShippers };
        };

        const doFetch = async () => {
            try {
                const response = await GMRequest.fetch({
                    method: 'GET',
                    url: CONFIG.SHAREPOINT.API_URL,
                    headers: { 'Accept': 'application/json;odata=verbose', 'Content-Type': 'application/json' },
                    timeout: CONFIG.SHAREPOINT.REQUEST_TIMEOUT
                });

                const { validMap, allShippers } = parseResponse(response);
                configMap = validMap;
                allShippersData = allShippers;
                lastFetchTime = Date.now();

                AppState.update({
                    sowStatus: SOWStatus.LOADED,
                    sowShipperCount: configMap.size,
                    sowLastError: null,
                    sowLastRefresh: lastFetchTime
                });

                Logger.info(`SOW loaded: ${configMap.size} valid configurations`);
                Telemetry.track(TelemetryEventType.SOW_LOAD, { success: true, validCount: configMap.size, totalCount: allShippers.length });
                EventBus.emit('sowUpdate');
                EventBus.emit('showToast', Messages.SUCCESS.SOW_LOADED(configMap.size), 'success');

                return true;
            } catch (error) {
                Logger.error('SOW fetch failed', error.message);

                let status = SOWStatus.ERROR;
                let errorMessage = Messages.ERRORS.SOW_SERVER_UNREACHABLE;

                if (error.type === ErrorType.AUTH || error.message?.includes('401') || error.message?.includes('403')) {
                    status = SOWStatus.AUTH_REQUIRED;
                    errorMessage = Messages.ERRORS.SOW_AUTH_REQUIRED;
                }

                AppState.update({ sowStatus: status, sowShipperCount: 0, sowLastError: errorMessage });
                Telemetry.track(TelemetryEventType.SOW_LOAD, { success: false, error: error.message });
                EventBus.emit('sowUpdate');
                EventBus.emit('showToast', errorMessage, 'error');

                return false;
            }
        };

        return {
            async init() { return this.fetch(); },

            async fetch() {
                if (isLoading && loadingPromise) return loadingPromise;

                isLoading = true;
                AppState.set('sowStatus', SOWStatus.LOADING);
                EventBus.emit('sowUpdate');

                loadingPromise = doFetch();

                try {
                    return await loadingPromise;
                } finally {
                    isLoading = false;
                    loadingPromise = null;
                }
            },

            getConfig(shipperName) {
                if (!shipperName) return null;
                return configMap.get(shipperName) || null;
            },

            validateShipper(shipperName) {
                const result = { valid: false, config: null, error: null, errorType: null };

                if (AppState.get('sowStatus') !== SOWStatus.LOADED) {
                    result.error = Messages.ERRORS.SOW_SERVER_UNREACHABLE;
                    result.errorType = ResultType.SOW_NOT_CONFIGURED;
                    return result;
                }

                const config = this.getConfig(shipperName);
                if (!config) {
                    result.error = Messages.ERRORS.SOW_NOT_CONFIGURED(shipperName);
                    result.errorType = ResultType.SOW_NOT_CONFIGURED;
                    return result;
                }

                if (!config.isActive) {
                    result.error = Messages.ERRORS.SOW_DISABLED(shipperName);
                    result.errorType = ResultType.SOW_DISABLED;
                    return result;
                }

                if (!config.isComplete) {
                    result.error = Messages.ERRORS.SOW_INCOMPLETE(shipperName);
                    result.errorType = ResultType.SOW_INCOMPLETE;
                    return result;
                }

                result.valid = true;
                result.config = config;
                return result;
            },

            getShipperNames: () => Array.from(configMap.keys()),
            getAllConfigs: () => Array.from(configMap.values()),
            getAllShippersData: () => [...allShippersData],

            getStatistics() {
                const stats = { total: allShippersData.length, active: 0, inactive: 0, validationErrors: 0, hourlyRate: 0, minuteRate: 0 };
                for (const shipper of allShippersData) {
                    if (shipper.status === ShipperStatus.ACTIVE) {
                        stats.active++;
                        const rateUnit = String(shipper.rawData.RateUnit || '').toUpperCase();
                        rateUnit === 'MINUTE' ? stats.minuteRate++ : stats.hourlyRate++;
                    } else if (shipper.status === ShipperStatus.INACTIVE) {
                        stats.inactive++;
                    } else if (shipper.status === ShipperStatus.VALIDATION_ERROR) {
                        stats.validationErrors++;
                    }
                }
                return stats;
            },

            filterShippers(searchTerm, filters) {
                let filtered = [...allShippersData];

                if (searchTerm?.trim()) {
                    const term = searchTerm.trim().toLowerCase();
                    filtered = filtered.filter(s => s.shipperName.toLowerCase().includes(term));
                }

                if (filters.status !== 'all') {
                    if (filters.status === 'active') filtered = filtered.filter(s => s.status === ShipperStatus.ACTIVE);
                    else if (filters.status === 'inactive') filtered = filtered.filter(s => s.status === ShipperStatus.INACTIVE);
                    else if (filters.status === 'error') filtered = filtered.filter(s => s.status === ShipperStatus.VALIDATION_ERROR);
                }

                if (filters.rateType !== 'all') {
                    filtered = filtered.filter(s => {
                        const rateUnit = String(s.rawData.RateUnit || '').toUpperCase();
                        return filters.rateType === 'minute' ? rateUnit === 'MINUTE' : rateUnit !== 'MINUTE';
                    });
                }

                if (filters.validation !== 'all') {
                    filtered = filtered.filter(s => filters.validation === 'invalid'
                        ? s.status === ShipperStatus.VALIDATION_ERROR
                        : s.status !== ShipperStatus.VALIDATION_ERROR);
                }

                if (filters.hideInactive) {
                    filtered = filtered.filter(s => s.status !== ShipperStatus.INACTIVE);
                }

                return filtered;
            },

            isLoaded: () => AppState.get('sowStatus') === SOWStatus.LOADED && configMap.size > 0,
            getShipperCount: () => configMap.size,
            getLastRefreshTime: () => lastFetchTime,

            clear() {
                configMap.clear();
                allShippersData = [];
                lastFetchTime = 0;
                AppState.update({ sowStatus: SOWStatus.NOT_LOADED, sowShipperCount: 0 });
            },

            getStatus() {
                return {
                    status: AppState.get('sowStatus'),
                    shipperCount: configMap.size,
                    totalShippers: allShippersData.length,
                    lastFetchTime,
                    lastError: AppState.get('sowLastError'),
                    isLoading
                };
            }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 25: DATA HELPERS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const DataHelpers = {
        formatStatusDisplay(statusCode) {
            if (!statusCode) return { display: 'Unknown', color: '#888888', group: 'unknown' };
            if (OrderStatusMap[statusCode]) return OrderStatusMap[statusCode];

            const upperStatus = statusCode.toUpperCase();
            let group = 'active', color = '#f0ad4e';
            if (upperStatus.includes('CANCEL') || upperStatus.includes('REJECT')) { group = 'cancelled'; color = '#d9534f'; }
            else if (upperStatus.includes('PAID')) { group = 'paid'; color = '#5cb85c'; }
            else if (upperStatus.includes('INVOICE') || upperStatus === 'PENDING_PAYMENT') { group = 'invoiced'; color = '#5cb85c'; }

            const display = statusCode.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            return { display, color, group };
        },

        formatLoadType(loadingType) {
            if (!loadingType) return { display: 'Unknown', icon: '📦', isDropHook: false, key: 'LIVE' };
            const upper = loadingType.toUpperCase();
            const isDropHook = upper.includes('DROP') || upper.includes('HOOK');
            return { display: isDropHook ? 'Drop Hook' : 'Live', icon: isDropHook ? '🪝' : '🔄', isDropHook, key: isDropHook ? 'DROP_HOOK' : 'LIVE' };
        },

        formatStopType(stopActionType) {
            if (!stopActionType) return { display: 'Unknown', label: 'STOP', class: CSS_CLASSES.PICKUP, isPickup: false, key: 'DROP_OFF' };
            const upper = stopActionType.toUpperCase();
            const isPickup = upper.includes('PICKUP') || upper === 'PICK_UP';
            return {
                display: isPickup ? 'Pickup' : 'Drop Off',
                label: isPickup ? 'SHIPPER' : 'RECEIVER',
                class: isPickup ? CSS_CLASSES.PICKUP : CSS_CLASSES.DROPOFF,
                isPickup,
                key: isPickup ? 'PICKUP' : 'DROP_OFF'
            };
        },

        findDetentionHolds(pricing) {
            const result = {
                shipper: false, receiver: false, shipperCode: null, receiverCode: null,
                shipperItem: null, receiverItem: null, shipperAmount: 0, receiverAmount: 0,
                shipperExists: false, receiverExists: false
            };

            if (!Array.isArray(pricing)) return result;

            for (const item of pricing) {
                const code = String(item.pricingCode || '').toUpperCase();
                const value = item.price?.value || 0;

                if (code.includes('DETENTION') && (code.includes('SHIPPER') || code.includes('PICKUP') || code.includes('ORIGIN'))) {
                    result.shipperCode = item.pricingCode;
                    result.shipperItem = item;
                    result.shipperAmount = value;
                    result.shipperExists = true;
                    if (value === 0) result.shipper = true;
                }

                if (code.includes('DETENTION') && (code.includes('RECEIVER') || code.includes('DELIVERY') || code.includes('DESTINATION') || code.includes('CONSIGNEE'))) {
                    result.receiverCode = item.pricingCode;
                    result.receiverItem = item;
                    result.receiverAmount = value;
                    result.receiverExists = true;
                    if (value === 0) result.receiver = true;
                }
            }

            return result;
        },

        calculateTimeDiff(planned, actual) {
            if (!planned || !actual) return { minutes: null, text: 'Pending', class: CSS_CLASSES.PENDING, label: '', status: 'UNKNOWN' };

            try {
                const plannedDate = typeof planned === 'number' ? planned : new Date(planned).getTime();
                const actualDate = typeof actual === 'number' ? actual : new Date(actual).getTime();

                if (isNaN(plannedDate) || isNaN(actualDate)) return { minutes: null, text: 'Invalid', class: CSS_CLASSES.PENDING, label: '', status: 'UNKNOWN' };

                const plannedMinutes = Math.floor(plannedDate / 60000) * 60000;
                const actualMinutes = Math.floor(actualDate / 60000) * 60000;
                const diffMinutes = Math.round((actualMinutes - plannedMinutes) / 60000);

                let status = 'ON_TIME';
                if (diffMinutes <= CONFIG.TIMING.EARLY_MINUTES) status = 'EARLY';
                else if (diffMinutes > CONFIG.TIMING.ON_TIME_MINUTES) status = 'LATE';

                if (diffMinutes > 0) return { minutes: diffMinutes, text: Helpers.formatDuration(diffMinutes), class: CSS_CLASSES.LATE, label: 'LATE', status };
                if (diffMinutes < 0) return { minutes: diffMinutes, text: Helpers.formatDuration(Math.abs(diffMinutes)), class: CSS_CLASSES.EARLY, label: 'EARLY', status };
                return { minutes: 0, text: 'ON TIME', class: CSS_CLASSES.ON_TIME, label: '', status: 'ON_TIME' };
            } catch (e) {
                return { minutes: null, text: 'Error', class: CSS_CLASSES.PENDING, label: '', status: 'UNKNOWN' };
            }
        },

        getDetentionPricingConfig: (isPickup) => isPickup ? DetentionPricing.SHIPPER : DetentionPricing.RECEIVER,

        getActionDisplayText(analysis) {
            if (!analysis) return Messages.INFO.NO_ACTION_NEEDED;

            if (analysis.processed) {
                switch (analysis.processedAction) {
                    case 'updated': return `$${analysis.processedAmount.toFixed(2)} (Charge Added)`;
                    case 'created': return `$${analysis.processedAmount.toFixed(2)} (Recovered)`;
                    case 'released': return '$0 (Hold Released)';
                    case 'skipped': return 'Skipped';
                    case 'timeout': return 'Timeout';
                    case 'analysis_only': return `$${analysis.charge.toFixed(2)} (Analysis Only)`;
                    default: return Messages.INFO.NO_ACTION_NEEDED;
                }
            }

            switch (analysis.type) {
                case ResultType.CHARGEABLE:
                case ResultType.CHARGEABLE_MAX:
                    return analysis.action === ActionType.ANALYSIS_ONLY
                        ? `$${analysis.charge.toFixed(2)} (Analysis Only)`
                        : `$${analysis.charge.toFixed(2)} (Chargeable)`;
                case ResultType.CHARGE_EXISTS: return `$${analysis.existingAmount.toFixed(2)} (Already Exists)`;
                case ResultType.WITHIN_FREE_TIME:
                case ResultType.NO_HOLD_NO_CHARGE: return '$0 (Within Free Time)';
                case ResultType.BELOW_MINIMUM_THRESHOLD: return '$0 (Below Minimum)';
                case ResultType.DRIVER_LATE: return '$0 (Driver Late)';
                case ResultType.NO_DETENTION_DROP_HOOK: return '$0 (Drop & Hook)';
                case ResultType.MISSING_ARRIVAL: return 'Awaiting Arrival';
                case ResultType.MISSING_DEPARTURE: return 'Awaiting Departure';
                case ResultType.ORDER_CANCELLED: return 'Order Cancelled';
                case ResultType.ORDER_INVOICED: return 'Already Invoiced';
                case ResultType.FMC_DATA_UNAVAILABLE: return 'FMC Unavailable';
                case ResultType.SOW_NOT_CONFIGURED: return 'SOW Not Configured';
                case ResultType.SOW_DISABLED: return 'SOW Disabled';
                default: return Messages.INFO.NO_ACTION_NEEDED;
            }
        },

        getBreakdownDetails(analysis, fmcStopData, timezone) {
            const details = [];
            if (!analysis || !fmcStopData?.timestamps) {
                details.push('• FMC data unavailable');
                return details;
            }

            const ts = fmcStopData.timestamps;

            if (ts.actualYardArrival && ts.plannedYardArrival) {
                const arrivalDiff = this.calculateTimeDiff(ts.plannedYardArrival, ts.actualYardArrival);
                const arrivalStatus = arrivalDiff.minutes <= 0 ? 'On time' : 'Late';
                details.push(`• Arrival: ${arrivalStatus} (${Helpers.formatDelta(arrivalDiff.minutes)})`);
            } else if (!ts.actualYardArrival) {
                details.push('• Arrival: Pending');
            }

            if (ts.actualYardDeparture && ts.plannedYardDeparture) {
                const depDiff = this.calculateTimeDiff(ts.plannedYardDeparture, ts.actualYardDeparture);
                const depStatus = depDiff.minutes <= 0 ? 'On time' : `${Helpers.formatDuration(depDiff.minutes)} late`;
                details.push(`• Departure: ${depStatus}`);
            } else if (!ts.actualYardDeparture) {
                details.push('• Departure: Pending');
            }

            if (analysis.breakdown) {
                analysis.breakdown.split('\n').forEach(line => {
                    if (line.trim()) details.push(`• ${line.trim()}`);
                });
            }

            if (analysis.processed) {
                switch (analysis.processedAction) {
                    case 'updated': details.push(`• Action: Hold updated to $${analysis.processedAmount.toFixed(2)}`); break;
                    case 'created': details.push(`• Action: New charge created $${analysis.processedAmount.toFixed(2)}`); break;
                    case 'released': details.push('• Action: Hold released ($0)'); break;
                    case 'analysis_only': details.push('• Action: Analysis only (no auto-charge)'); break;
                }
            } else if (analysis.action === ActionType.RELEASE_HOLD) {
                details.push('• Action: Will release hold');
            } else if (analysis.action === ActionType.ADD_CHARGE_UPDATE || analysis.action === ActionType.ADD_CHARGE_CREATE) {
                details.push(`• Action: Will add charge $${analysis.charge.toFixed(2)}`);
            } else if (analysis.action === ActionType.ANALYSIS_ONLY) {
                details.push('• Action: Analysis only (auto-charge disabled)');
            }

            return details;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 26: FMC API SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const FMCApiService = {
        async fetchSMCExecution(orderId) {
            const url = `${CONFIG.URLS.SMC_EXECUTION_API}/operator-user-shipment?orderId=${encodeURIComponent(orderId)}`;
            const data = await HttpClient.request({ method: 'GET', url, headers: { 'Accept': 'application/json' } }, 'SMC Execution', circuitBreakers.execution);
            return this._parseSMCExecutionResponse(data);
        },

        _parseSMCExecutionResponse(data) {
            if (!data) throw ErrorHandler.create(ErrorType.PARSE, Messages.ERRORS.EMPTY_RESPONSE);
            if (!data.executionLegs?.length) throw ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.NO_EXECUTION_LEGS);

            const leg = data.executionLegs[0];
            if (!leg?.tourId) throw ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.NO_TOUR_ID);

            return {
                orderId: data.orderId,
                shipmentId: data.shipmentId,
                tourId: leg.tourId,
                vehicleRunId: leg.vehicleRunId,
                origin: {
                    nodeCode: leg.from?.facility?.ncsNodeCode || 'Unknown',
                    facilityName: leg.from?.facility?.facilityName || 'Unknown',
                    timezone: leg.from?.facility?.timezone || 'America/Los_Angeles',
                    loadingType: leg.from?.loadingType || 'Unknown'
                },
                destination: {
                    nodeCode: leg.to?.facility?.ncsNodeCode || 'Unknown',
                    facilityName: leg.to?.facility?.facilityName || 'Unknown',
                    timezone: leg.to?.facility?.timezone || 'America/Los_Angeles',
                    loadingType: leg.to?.loadingType || 'Unknown'
                },
                contractedLane: `${leg.from?.facility?.ncsNodeCode || ''}->${leg.to?.facility?.ncsNodeCode || ''}`
            };
        },

        async fetchFMCByTourId(tourId) {
            const url = `${CONFIG.URLS.FMC_BASE}/fmc/search/execution/by-id`;
            const requestBody = {
                searchIds: [tourId],
                searchByIds: true,
                page: 0,
                pageSize: 50,
                sortOrder: [{ field: "first_dock_arrival_time", dir: "asc" }],
                bookmarkedSavedSearch: false,
                executionViewModePreference: "vrs"
            };

            const data = await HttpClient.request({
                method: 'POST',
                url,
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }, 'FMC Data', circuitBreakers.fmc);

            if (!data?.success) throw ErrorHandler.create(ErrorType.BUSINESS, data?.errorMessage || Messages.ERRORS.FMC_API_FAILURE);
            return data.returnedObject;
        },

        findMatchingVR(fmcRecords, contractedLane) {
            if (!fmcRecords?.length || !contractedLane) return null;

            const [originCode, destCode] = contractedLane.split('->');

            const strategies = [
                (vr) => vr?.simpleFacilityLane === contractedLane,
                (vr) => vr?.facilityLaneString === contractedLane,
                (vr) => {
                    if (!vr?.aggregatedStops || vr.aggregatedStops.length < 2) return false;
                    const firstStop = vr.aggregatedStops[0]?.stopCode;
                    const lastStop = vr.aggregatedStops[vr.aggregatedStops.length - 1]?.stopCode;
                    return firstStop === originCode && lastStop === destCode;
                },
                (vr) => {
                    const lane = vr?.simpleFacilityLane || vr?.facilityLaneString || '';
                    return lane.includes(originCode) && lane.includes(destCode);
                }
            ];

            for (const strategy of strategies) {
                const match = fmcRecords.find(strategy);
                if (match) return match;
            }

            return fmcRecords.length > 0 ? fmcRecords[0] : null;
        },

        extractTimestamps(vrRecord) {
            if (!vrRecord?.aggregatedStops?.length) return null;

            const stops = vrRecord.aggregatedStops;
            const originStop = stops.find(s => !s?.lastStop) || stops[0];
            const destStop = stops.find(s => s?.lastStop) || stops[stops.length - 1];

            if (!originStop || !destStop) return null;

            const getActionTimestamps = (stop) => {
                if (!stop?.actions?.length) {
                    return {
                        plannedYardArrival: null, plannedYardDeparture: null,
                        actualYardArrival: null, actualYardDeparture: null,
                        actualYardArrivalSourceVrId: null, actualYardDepartureSourceVrId: null
                    };
                }
                const action = stop.actions[0];
                return {
                    plannedYardArrival: action?.plannedYardArrivalTime,
                    plannedYardDeparture: action?.plannedYardDepartureTime,
                    actualYardArrival: action?.actualYardArrivalTime,
                    actualYardDeparture: action?.actualYardDepartureTime,
                    actualYardArrivalSourceVrId: null,
                    actualYardDepartureSourceVrId: null
                };
            };

            return {
                origin: {
                    stopCode: originStop?.stopCode || 'Unknown',
                    displayName: originStop?.displayName || originStop?.stopCode || 'Unknown',
                    timezone: originStop?.timezone || 'America/Los_Angeles',
                    status: originStop?.status,
                    actionType: originStop?.actions?.[0]?.type || 'PICKUP',
                    timestamps: getActionTimestamps(originStop)
                },
                destination: {
                    stopCode: destStop?.stopCode || 'Unknown',
                    displayName: destStop?.displayName || destStop?.stopCode || 'Unknown',
                    timezone: destStop?.timezone || 'America/Los_Angeles',
                    status: destStop?.status,
                    actionType: destStop?.actions?.[0]?.type || 'DROPOFF',
                    timestamps: getActionTimestamps(destStop)
                },
                vrMetadata: {
                    vehicleRunId: vrRecord?.vehicleRunId,
                    tourId: vrRecord?.tourId
                }
            };
        },

        fillMissingTimestampsFromTour(timestamps, allRecords, currentVrId) {
            if (!timestamps || !allRecords?.length) return timestamps;

            const findTimestampFromOtherVRs = (stopCode, missingFields) => {
                const borrowedData = {};
                for (const vr of allRecords) {
                    if (vr?.vehicleRunId === currentVrId || !vr?.aggregatedStops) continue;
                    const matchingStop = vr.aggregatedStops.find(stop => stop?.stopCode === stopCode);
                    if (matchingStop?.actions?.length > 0) {
                        const action = matchingStop.actions[0];
                        for (const field of missingFields) {
                            if (!borrowedData[field] && action?.[field]) {
                                borrowedData[field] = { value: action[field], sourceVrId: vr.vehicleRunId };
                            }
                        }
                        if (Object.keys(borrowedData).length === missingFields.length) break;
                    }
                }
                return borrowedData;
            };

            // Fill origin
            if (timestamps.origin?.stopCode) {
                const originMissing = [];
                if (!timestamps.origin.timestamps?.actualYardArrival) originMissing.push('actualYardArrivalTime');
                if (!timestamps.origin.timestamps?.actualYardDeparture) originMissing.push('actualYardDepartureTime');

                if (originMissing.length > 0) {
                    const borrowed = findTimestampFromOtherVRs(timestamps.origin.stopCode, originMissing);
                    if (borrowed.actualYardArrivalTime && timestamps.origin.timestamps) {
                        timestamps.origin.timestamps.actualYardArrival = borrowed.actualYardArrivalTime.value;
                        timestamps.origin.timestamps.actualYardArrivalSourceVrId = borrowed.actualYardArrivalTime.sourceVrId;
                    }
                    if (borrowed.actualYardDepartureTime && timestamps.origin.timestamps) {
                        timestamps.origin.timestamps.actualYardDeparture = borrowed.actualYardDepartureTime.value;
                        timestamps.origin.timestamps.actualYardDepartureSourceVrId = borrowed.actualYardDepartureTime.sourceVrId;
                    }
                }
            }

            // Fill destination
            if (timestamps.destination?.stopCode) {
                const destMissing = [];
                if (!timestamps.destination.timestamps?.actualYardArrival) destMissing.push('actualYardArrivalTime');
                if (!timestamps.destination.timestamps?.actualYardDeparture) destMissing.push('actualYardDepartureTime');

                if (destMissing.length > 0) {
                    const borrowed = findTimestampFromOtherVRs(timestamps.destination.stopCode, destMissing);
                    if (borrowed.actualYardArrivalTime && timestamps.destination.timestamps) {
                        timestamps.destination.timestamps.actualYardArrival = borrowed.actualYardArrivalTime.value;
                        timestamps.destination.timestamps.actualYardArrivalSourceVrId = borrowed.actualYardArrivalTime.sourceVrId;
                    }
                    if (borrowed.actualYardDepartureTime && timestamps.destination.timestamps) {
                        timestamps.destination.timestamps.actualYardDeparture = borrowed.actualYardDepartureTime.value;
                        timestamps.destination.timestamps.actualYardDepartureSourceVrId = borrowed.actualYardDepartureTime.sourceVrId;
                    }
                }
            }

            return timestamps;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 27: SMC API SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const SMCApiService = {
        async fetchOrderView(orderId) {
            return await GMRequest.fetch({
                method: 'GET',
                url: `${CONFIG.URLS.SMC_BASE}/shipper/order/view/${encodeURIComponent(orderId)}`,
                headers: { 'Accept': 'application/json' }
            });
        },

        async fetchOrderFull(orderId) {
            return await GMRequest.fetch({
                method: 'GET',
                url: `${CONFIG.URLS.SMC_BASE}/shipper/order/${encodeURIComponent(orderId)}`,
                headers: { 'Accept': 'application/json' }
            });
        },

        async updateOrder(orderData, newPricing) {
            const token = TokenManager.getToken();
            if (!token) throw ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_MISSING);

            const orderId = orderData?.orderId?.id;
            if (!orderId) throw ErrorHandler.create(ErrorType.VALIDATION, 'Order ID required');

            const payload = {
                orderId: orderData.orderId,
                orderDetails: {
                    ...orderData.orderDetails,
                    shipperPricing: { ...orderData.orderDetails?.shipperPricing, pricing: newPricing }
                },
                vrId: orderData.vrId,
                tpId: orderData.tpId,
                auditDetails: orderData.auditDetails,
                orderStatus: orderData.orderStatus,
                invoiceStatus: orderData.invoiceStatus,
                executionStatus: orderData.executionStatus,
                executionSourceType: orderData.executionSourceType,
                orderCreationSource: orderData.orderCreationSource,
                invoiceNumbers: orderData.invoiceNumbers || [],
                invoiceDetails: orderData.invoiceDetails,
                requiresManualPlanChanges: orderData.requiresManualPlanChanges,
                orderAction: orderData.orderAction,
                orderExecutionItineraryVersion: orderData.orderExecutionItineraryVersion,
                shipmentList: orderData.shipmentList,
                tenderDecision: orderData.tenderDecision,
                businessIdentifier: orderData.businessIdentifier,
                validationFailureReasonCodes: orderData.validationFailureReasonCodes || [],
                tasks: []
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${CONFIG.URLS.SMC_BASE}/shipper/order/update`,
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'x-csrf-token': token },
                    data: JSON.stringify(payload),
                    withCredentials: true,
                    timeout: CONFIG.API.REQUEST_TIMEOUT,
                    onload: (response) => {
                        if (response.status === 200) resolve(true);
                        else if (response.status === 403) { TokenManager.clear(); reject(ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_EXPIRED)); }
                        else if (response.status === 409) reject(ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.VERSION_CONFLICT));
                        else if (response.status === 429) reject(ErrorHandler.create(ErrorType.RATE_LIMIT, Messages.ERRORS.RATE_LIMITED));
                        else reject(ErrorHandler.create(ErrorType.NETWORK, `HTTP ${response.status}`));
                    },
                    onerror: () => reject(ErrorHandler.create(ErrorType.NETWORK, Messages.ERRORS.NETWORK_ERROR)),
                    ontimeout: () => reject(ErrorHandler.create(ErrorType.TIMEOUT, Messages.ERRORS.TIMEOUT_ERROR))
                });
            });
        },

        async addPricingLine(orderId, orderVersion, pricingConfig, chargeAmount) {
            const token = TokenManager.getToken();
            if (!token) throw ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_MISSING);

            const payload = {
                pricingComponents: [{
                    price: { value: chargeAmount, unit: 'USD' },
                    reasonCode: 'ORIGINAL',
                    pricingCode: pricingConfig.pricingCode,
                    pricingId: null,
                    pricingComponentId: null,
                    description: pricingConfig.description,
                    type: 'ACCESSORIAL',
                    chargeDocuments: [],
                    taxComponents: [],
                    itemized: []
                }],
                orderId: { id: orderId, version: orderVersion }
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${CONFIG.URLS.SMC_BASE}/shipper/order/add-shipper-pricing`,
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'x-csrf-token': token },
                    data: JSON.stringify(payload),
                    withCredentials: true,
                    timeout: CONFIG.API.REQUEST_TIMEOUT,
                    onload: (response) => {
                        if (response.status === 200) resolve(true);
                        else if (response.status === 403) { TokenManager.clear(); reject(ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_EXPIRED)); }
                        else if (response.status === 409) reject(ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.VERSION_CONFLICT));
                        else if (response.status === 429) reject(ErrorHandler.create(ErrorType.RATE_LIMIT, Messages.ERRORS.RATE_LIMITED));
                        else reject(ErrorHandler.create(ErrorType.NETWORK, `HTTP ${response.status}`));
                    },
                    onerror: () => reject(ErrorHandler.create(ErrorType.NETWORK, Messages.ERRORS.NETWORK_ERROR)),
                    ontimeout: () => reject(ErrorHandler.create(ErrorType.TIMEOUT, Messages.ERRORS.TIMEOUT_ERROR))
                });
            });
        },

        async addComment(orderId, comment) {
            const token = TokenManager.getToken();
            if (!token || !comment) return false;

            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${CONFIG.URLS.SMC_BASE}/shipper/order/comments/add`,
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'x-csrf-token': token },
                    data: JSON.stringify({ orderId, comment }),
                    withCredentials: true,
                    timeout: CONFIG.TOKEN.FETCH_TIMEOUT,
                    onload: (response) => resolve(response.status === 200),
                    onerror: () => resolve(false),
                    ontimeout: () => resolve(false)
                });
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 28: DETENTION ANALYZER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const DetentionAnalyzer = {
        analyze(stop, fmcTimestamps, sowConfig, orderStatus, holdInfo, stopIndex, shipperName) {
            const stopTypeInfo = DataHelpers.formatStopType(stop?.stopActionType);
            const loadTypeInfo = DataHelpers.formatLoadType(stop?.loadingType);
            const isPickup = stopTypeInfo.isPickup;

            const hasHold = isPickup ? holdInfo.shipper : holdInfo.receiver;
            const holdCode = isPickup ? holdInfo.shipperCode : holdInfo.receiverCode;
            const detentionExists = isPickup ? holdInfo.shipperExists : holdInfo.receiverExists;
            const existingAmount = isPickup ? holdInfo.shipperAmount : holdInfo.receiverAmount;

            const result = {
                type: null, charge: 0, breakdown: '', hitMax: false,
                action: ActionType.NO_ACTION, actionText: '', comment: '',
                hasHold, holdCode, detentionExists, existingAmount, isPickup, fmcTimestamps,
                requiresApproval: sowConfig?.requiresApproval || false,
                autoChargeAllowed: sowConfig?.autoChargeAllowed || false,
                authNumberRequired: sowConfig?.authNumberRequired || false,
                sowConfig, processed: false, processedAction: null, processedAmount: null, processError: null
            };

            const statusInfo = DataHelpers.formatStatusDisplay(orderStatus);

            // Check order status
            if (statusInfo.group === 'cancelled') {
                return this._setResult(result, ResultType.ORDER_CANCELLED, 'Order was cancelled', ActionType.NO_ACTION, 'Order cancelled');
            }
            if (statusInfo.group === 'invoiced' || statusInfo.group === 'paid') {
                return this._setResult(result, ResultType.ORDER_INVOICED, 'Order already invoiced', ActionType.NO_ACTION, 'Already invoiced');
            }

            // Check if charge exists
            if (existingAmount > 0) {
                result.type = ResultType.CHARGE_EXISTS;
                result.charge = existingAmount;
                result.breakdown = `Detention charge exists: $${existingAmount.toFixed(2)}`;
                result.action = ActionType.NO_ACTION;
                result.actionText = `Charge exists ($${existingAmount.toFixed(2)})`;
                return result;
            }

            // Check FMC data
            if (!fmcTimestamps?.timestamps) {
                return this._setResult(result, ResultType.FMC_DATA_UNAVAILABLE, 'FMC data unavailable', ActionType.PENDING, 'FMC unavailable');
            }

            const ts = fmcTimestamps.timestamps;

            if (!ts.actualYardArrival) {
                return this._setResult(result, ResultType.MISSING_ARRIVAL, 'Driver not arrived', ActionType.PENDING, Messages.INFO.AWAITING_ARRIVAL);
            }
            if (!ts.actualYardDeparture) {
                return this._setResult(result, ResultType.MISSING_DEPARTURE, 'Driver not departed', ActionType.PENDING, Messages.INFO.AWAITING_DEPARTURE);
            }

            // Check eligibility
            const stopKey = stopTypeInfo.key;
            const loadKey = loadTypeInfo.key;
            const rules = sowConfig?.rules?.[stopKey]?.[loadKey];

            if (!rules) {
                return this._setResult(result, ResultType.UNKNOWN_ERROR, `No rules for ${stopKey}/${loadKey}`, ActionType.ERROR, 'SOW rule missing');
            }

            if (!rules.eligible) {
                result.type = ResultType.NO_DETENTION_DROP_HOOK;
                result.breakdown = `${loadTypeInfo.display} - Not eligible per SOW`;
                if (hasHold) {
                    result.action = ActionType.RELEASE_HOLD;
                    result.actionText = 'Release hold (Not eligible)';
                    result.comment = Messages.COMMENTS.RELEASE_HOLD;
                } else {
                    result.action = ActionType.NO_ACTION;
                    result.actionText = 'No detention (Not eligible)';
                }
                return result;
            }

            // Check driver late
            const arrivalDiff = DataHelpers.calculateTimeDiff(ts.plannedYardArrival, ts.actualYardArrival);
            if (arrivalDiff.minutes !== null && arrivalDiff.minutes > CONFIG.TIMING.LATE_MINUTES) {
                result.type = ResultType.DRIVER_LATE;
                result.breakdown = `Driver arrived ${Helpers.formatDuration(arrivalDiff.minutes)} late`;
                if (hasHold) {
                    result.action = ActionType.RELEASE_HOLD;
                    result.actionText = 'Release hold (Late)';
                    result.comment = Messages.COMMENTS.RELEASE_HOLD;
                } else {
                    result.action = ActionType.NO_ACTION;
                    result.actionText = Messages.INFO.DRIVER_LATE;
                }
                return result;
            }

            // Calculate charge
            const departureDiff = DataHelpers.calculateTimeDiff(ts.plannedYardDeparture, ts.actualYardDeparture);
            const delayMinutes = (departureDiff.minutes !== null && departureDiff.minutes > 0) ? departureDiff.minutes : 0;

            return this._calculateCharge(result, sowConfig, rules, delayMinutes, hasHold);
        },

        _setResult(result, type, breakdown, action, actionText) {
            result.type = type;
            result.breakdown = breakdown;
            result.action = action;
            result.actionText = actionText;
            return result;
        },

        _calculateCharge(result, sowConfig, rules, delayMinutes, hasHold) {
            const freeTime = rules.freeTime || 0;
            let chargeableMinutes = delayMinutes - freeTime;

            if (chargeableMinutes <= 0) {
                result.type = ResultType.WITHIN_FREE_TIME;
                result.breakdown = `Delay: ${delayMinutes}m, Free: ${freeTime}m - No charge`;
                if (hasHold) {
                    result.action = ActionType.RELEASE_HOLD;
                    result.actionText = 'Release hold ($0)';
                    result.comment = Messages.COMMENTS.RELEASE_HOLD;
                } else {
                    result.type = ResultType.NO_HOLD_NO_CHARGE;
                    result.action = ActionType.NO_ACTION;
                    result.actionText = Messages.INFO.NO_ACTION_NEEDED;
                }
                return result;
            }

            // Check minimum threshold
            if (sowConfig.roundDownMaxMinutes && sowConfig.roundDownMaxMinutes > 0 && chargeableMinutes < sowConfig.roundDownMaxMinutes) {
                result.type = ResultType.BELOW_MINIMUM_THRESHOLD;
                result.breakdown = `Chargeable: ${chargeableMinutes}m < Min: ${sowConfig.roundDownMaxMinutes}m`;
                if (hasHold) {
                    result.action = ActionType.RELEASE_HOLD;
                    result.actionText = 'Release hold (Below min)';
                    result.comment = Messages.COMMENTS.RELEASE_HOLD;
                } else {
                    result.action = ActionType.NO_ACTION;
                    result.actionText = Messages.INFO.BELOW_MINIMUM;
                }
                return result;
            }

            // Apply rounding
            const originalMinutes = chargeableMinutes;
            if (sowConfig.billingIncrement && sowConfig.billingIncrement > 0 && sowConfig.roundingRule) {
                chargeableMinutes = this._applyBillingIncrement(chargeableMinutes, sowConfig.billingIncrement, sowConfig.roundingRule);
            }

            // Calculate charge
            let charge = sowConfig.rateUnit === 'MINUTE'
                ? chargeableMinutes * sowConfig.rate
                : (chargeableMinutes / 60) * sowConfig.rate;

            charge = Math.round(charge * 100) / 100;
            const hitMax = charge >= sowConfig.maxCharge;
            charge = Math.min(charge, sowConfig.maxCharge);

            result.charge = charge;
            result.hitMax = hitMax;

            // Build breakdown
            const lines = [
                `Delay: ${delayMinutes}m, Free: -${freeTime}m`,
                `Chargeable: ${originalMinutes}m${chargeableMinutes !== originalMinutes ? ` → ${chargeableMinutes}m` : ''}`,
                `Rate: $${sowConfig.rate}/${sowConfig.rateUnit === 'MINUTE' ? 'min' : 'hr'}`,
                `Charge: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`
            ];
            result.breakdown = lines.join('\n');

            return this._determineAction(result, charge, hasHold, hitMax, sowConfig);
        },

        _applyBillingIncrement(minutes, increment, roundingRule) {
            if (!increment || increment <= 0) return minutes;
            const remainder = minutes % increment;
            if (remainder === 0) return minutes;

            const rule = String(roundingRule || '').toUpperCase();
            switch (rule) {
                case 'UP': return minutes + (increment - remainder);
                case 'DOWN': return minutes - remainder;
                case 'NEAREST': return remainder >= increment / 2 ? minutes + (increment - remainder) : minutes - remainder;
                default: return minutes + (increment - remainder);
            }
        },

        _determineAction(result, charge, hasHold, hitMax, sowConfig) {
            const autoChargeAllowed = sowConfig?.autoChargeAllowed === true;
            const requiresApproval = sowConfig?.requiresApproval === true;

            if (autoChargeAllowed) {
                if (requiresApproval) {
                    result.type = ResultType.CHARGEABLE;
                    result.action = ActionType.PENDING_APPROVAL;
                    result.actionText = `Approval needed: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`;
                    return result;
                }

                result.type = hitMax ? ResultType.CHARGEABLE_MAX : ResultType.CHARGEABLE;
                if (hasHold) {
                    result.action = ActionType.ADD_CHARGE_UPDATE;
                    result.actionText = `Update to $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`;
                    result.comment = Messages.COMMENTS.ADD_CHARGE;
                } else {
                    result.action = ActionType.ADD_CHARGE_CREATE;
                    result.actionText = `Recover $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`;
                    result.comment = Messages.COMMENTS.ADD_CHARGE;
                }
                return result;
            }

            if (requiresApproval) {
                result.type = ResultType.CHARGEABLE;
                result.action = ActionType.PENDING_APPROVAL;
                result.actionText = `Approval needed: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`;
                return result;
            }

            result.type = hitMax ? ResultType.CHARGEABLE_MAX : ResultType.CHARGEABLE;
            result.action = ActionType.ANALYSIS_ONLY;
            result.actionText = `Analysis only: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`;
            return result;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 29: HTML GENERATOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const HTMLGenerator = {
        getStatusIcon(status) {
            switch (status) {
                case ShipperStatus.ACTIVE: return '✅';
                case ShipperStatus.INACTIVE: return '⏸️';
                case ShipperStatus.VALIDATION_ERROR: return '❌';
                default: return '❓';
            }
        },

        getStatusClass(status) {
            switch (status) {
                case ShipperStatus.ACTIVE: return CSS_CLASSES.STATUS_ACTIVE;
                case ShipperStatus.INACTIVE: return CSS_CLASSES.STATUS_INACTIVE;
                case ShipperStatus.VALIDATION_ERROR: return CSS_CLASSES.STATUS_ERROR;
                default: return '';
            }
        },

        renderShipperCard(shipper, isExpanded) {
            const statusIcon = this.getStatusIcon(shipper.status);
            const statusClass = this.getStatusClass(shipper.status);
            const data = shipper.rawData;
            const escapedName = Helpers.escapeHtml(shipper.shipperName);
            const safeId = escapedName.replace(/[^a-zA-Z0-9-]/g, '-');

            return `
                <div class="d-dart-shipper-card-settings ${statusClass}" data-shipper="${escapedName}">
                    <div class="d-dart-shipper-header-settings" data-toggle-shipper="${escapedName}">
                        <div class="d-dart-shipper-info">
                            <span class="d-dart-shipper-status-icon">${statusIcon}</span>
                            <span class="d-dart-shipper-name-settings">${escapedName}</span>
                        </div>
                        <div class="d-dart-shipper-summary">
                            ${shipper.status !== ShipperStatus.VALIDATION_ERROR ? `
                                <span class="d-dart-shipper-rate">💰 ${Helpers.formatValueOrDash(data.Rate ? `$${data.Rate}/${String(data.RateUnit || 'hr').toLowerCase()}` : null)}</span>
                                <span class="d-dart-shipper-max">🔝 ${Helpers.formatValueOrDash(data.MaxCharge ? `$${data.MaxCharge}` : null)}</span>
                            ` : `<span class="d-dart-validation-error-badge">⚠️ Validation Error</span>`}
                            <button class="d-dart-expand-btn">${isExpanded ? '▲' : '▼'}</button>
                        </div>
                    </div>
                    <div class="d-dart-shipper-details ${isExpanded ? CSS_CLASSES.EXPANDED : ''}" id="d-dart-details-${safeId}">
                        ${shipper.status === ShipperStatus.VALIDATION_ERROR ? `
                            <div class="d-dart-validation-errors">
                                <div class="d-dart-error-title">❌ Validation Errors:</div>
                                <ul class="d-dart-error-list">
                                    ${shipper.validationErrors.map(err => `<li>${Helpers.escapeHtml(err)}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        <div class="d-dart-details-grid">
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📌 BASIC</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Rate:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.Rate)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Unit:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.RateUnit)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Max:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.MaxCharge ? `$${data.MaxCharge}` : null)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Active:</span><span class="d-dart-details-value ${parseBoolean(data.IsActive, true) ? 'yes' : 'no'}">${Helpers.formatBoolean(data.IsActive)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 PU LIVE</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.PU_Live_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Free:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.PU_Live_FreeTime != null ? `${data.PU_Live_FreeTime}m` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 PU D&H</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.PU_DropHook_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Free:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.PU_DropHook_FreeTime != null ? `${data.PU_DropHook_FreeTime}m` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 DO LIVE</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.DO_Live_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Free:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.DO_Live_FreeTime != null ? `${data.DO_Live_FreeTime}m` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 DO D&H</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.DO_DropHook_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Free:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.DO_DropHook_FreeTime != null ? `${data.DO_DropHook_FreeTime}m` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">⚙️ OPTIONS</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Billing:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.BillingIncrement ? `${data.BillingIncrement}m` : null)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Round:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.RoundingRule)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Auto:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.AutoChargeAllowed)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Approval:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.RequiresApproval)}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        renderShippersList() {
            const filters = AppState.get('settingsFilters');
            const searchTerm = AppState.get('settingsSearchTerm');
            const expandedShippers = AppState.get('expandedShippers');
            const shippers = SOWConfigManager.filterShippers(searchTerm, filters);

            if (shippers.length === 0) {
                return '<div class="d-dart-no-results">No shippers match your filters</div>';
            }

            return shippers.map(shipper =>
                this.renderShipperCard(shipper, expandedShippers.has(shipper.shipperName))
            ).join('');
        },

        settingsPanel() {
            const stats = SOWConfigManager.getStatistics();
            const lastRefresh = SOWConfigManager.getLastRefreshTime();
            const filters = AppState.get('settingsFilters');
            const searchTerm = AppState.get('settingsSearchTerm');

            return `
                <div class="d-dart-settings-panel" id="d-dart-settings-panel" role="dialog" aria-modal="true">
                    <div class="d-dart-settings-header">
                        <span class="d-dart-settings-title">⚙️ SOW SETTINGS</span>
                        <button class="d-dart-settings-close" id="d-dart-settings-close" title="Close">✕</button>
                    </div>
                    <div class="d-dart-settings-body">
                        <div class="d-dart-settings-section">
                            <div class="d-dart-settings-section-title">📊 SUMMARY</div>
                            <div class="d-dart-stats-grid">
                                <div class="d-dart-stat-box"><span class="d-dart-stat-value">${stats.total}</span><span class="d-dart-stat-label">Total</span></div>
                                <div class="d-dart-stat-box active"><span class="d-dart-stat-value">${stats.active}</span><span class="d-dart-stat-label">✅ Active</span></div>
                                <div class="d-dart-stat-box inactive"><span class="d-dart-stat-value">${stats.inactive}</span><span class="d-dart-stat-label">⏸️ Inactive</span></div>
                                <div class="d-dart-stat-box error"><span class="d-dart-stat-value">${stats.validationErrors}</span><span class="d-dart-stat-label">❌ Errors</span></div>
                            </div>
                            <div class="d-dart-last-refresh">🕐 Last Refresh: ${Helpers.formatRelativeTime(lastRefresh)}</div>
                        </div>
                        <div class="d-dart-settings-actions">
                            <button class="d-dart-action-btn" id="d-dart-refresh-sow">🔄 Refresh</button>
                            <button class="d-dart-action-btn" id="d-dart-expand-all">⬇️ Expand</button>
                            <button class="d-dart-action-btn" id="d-dart-collapse-all">⬆️ Collapse</button>
                        </div>
                        <div class="d-dart-settings-section">
                            <div class="d-dart-settings-section-title">🔍 FILTERS</div>
                            <div class="d-dart-search-box">
                                <input type="text" class="d-dart-search-input" id="d-dart-shipper-search" placeholder="Search shipper..." value="${Helpers.escapeHtml(searchTerm || '')}">
                                <span class="d-dart-search-icon">🔍</span>
                            </div>
                            <div class="d-dart-filters-grid">
                                <div class="d-dart-filter-group">
                                    <label class="d-dart-filter-label">Status:</label>
                                    <select class="d-dart-filter-select" id="d-dart-filter-status">
                                        <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All</option>
                                        <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                        <option value="error" ${filters.status === 'error' ? 'selected' : ''}>Error</option>
                                    </select>
                                </div>
                                <div class="d-dart-filter-group">
                                    <label class="d-dart-filter-label">Rate:</label>
                                    <select class="d-dart-filter-select" id="d-dart-filter-rate">
                                        <option value="all" ${filters.rateType === 'all' ? 'selected' : ''}>All</option>
                                        <option value="hour" ${filters.rateType === 'hour' ? 'selected' : ''}>Hourly</option>
                                        <option value="minute" ${filters.rateType === 'minute' ? 'selected' : ''}>Minute</option>
                                    </select>
                                </div>
                            </div>
                            <label class="d-dart-checkbox-label">
                                <input type="checkbox" id="d-dart-hide-inactive" ${filters.hideInactive ? 'checked' : ''}>
                                Hide Inactive
                            </label>
                        </div>
                        <div class="d-dart-settings-section">
                            <div class="d-dart-settings-section-title">📋 SHIPPERS (${stats.total})</div>
                            <div class="d-dart-shippers-list" id="d-dart-shippers-list">${this.renderShippersList()}</div>
                        </div>
                    </div>
                </div>
            `;
        },

        getBannerValueClass(analysis) {
            if (!analysis) return 'no-action';
            if (analysis.processed) {
                switch (analysis.processedAction) {
                    case 'updated':
                    case 'created': return 'charge-added';
                    case 'released': return 'hold-released';
                    case 'analysis_only': return 'analysis-only';
                    default: return 'no-action';
                }
            }
            switch (analysis.type) {
                case ResultType.CHARGEABLE:
                case ResultType.CHARGEABLE_MAX: return analysis.action === ActionType.ANALYSIS_ONLY ? 'analysis-only' : 'chargeable';
                case ResultType.CHARGE_EXISTS: return 'charge-exists';
                case ResultType.MISSING_ARRIVAL:
                case ResultType.MISSING_DEPARTURE:
                case ResultType.FMC_DATA_UNAVAILABLE: return 'pending';
                case ResultType.DRIVER_LATE:
                case ResultType.ORDER_CANCELLED:
                case ResultType.BELOW_MINIMUM_THRESHOLD: return 'no-charge';
                default: return 'no-action';
            }
        },

        detentionSummaryBanner(orderData) {
            const analysisResults = orderData?.analysisResults || [];
            const shipperAnalysis = analysisResults.find(a => a?.isPickup);
            const receiverAnalysis = analysisResults.find(a => !a?.isPickup);

            const shipperText = DataHelpers.getActionDisplayText(shipperAnalysis);
            const receiverText = DataHelpers.getActionDisplayText(receiverAnalysis);
            const toggleId = generateId('detention-details');

            const shipperFmcData = shipperAnalysis?.fmcStopData || orderData?.fmcTimestamps?.origin;
            const receiverFmcData = receiverAnalysis?.fmcStopData || orderData?.fmcTimestamps?.destination;

            const shipperTimezone = shipperFmcData?.timezone || 'America/Los_Angeles';
            const receiverTimezone = receiverFmcData?.timezone || 'America/Los_Angeles';

            const shipperBreakdown = DataHelpers.getBreakdownDetails(shipperAnalysis, shipperFmcData, shipperTimezone);
            const receiverBreakdown = DataHelpers.getBreakdownDetails(receiverAnalysis, receiverFmcData, receiverTimezone);

            return `
                <div class="d-dart-detention-banner">
                    <div class="d-dart-banner-header">
                        <span class="d-dart-banner-title">📊 DETENTION SUMMARY</span>
                        <button class="d-dart-banner-toggle" data-toggle-target="${toggleId}">▼ Details</button>
                    </div>
                    <div class="d-dart-banner-summary">
                        <div class="d-dart-banner-row">
                            <span class="d-dart-banner-label">SHIPPER:</span>
                            <span class="d-dart-banner-value ${this.getBannerValueClass(shipperAnalysis)}">${Helpers.escapeHtml(shipperText)}</span>
                        </div>
                        <div class="d-dart-banner-row">
                            <span class="d-dart-banner-label">RECEIVER:</span>
                            <span class="d-dart-banner-value ${this.getBannerValueClass(receiverAnalysis)}">${Helpers.escapeHtml(receiverText)}</span>
                        </div>
                    </div>
                    <div class="d-dart-banner-details" id="${toggleId}">
                        <div class="d-dart-breakdown-section">
                            <div class="d-dart-breakdown-title">SHIPPER:</div>
                            <div class="d-dart-breakdown-content">${shipperBreakdown.map(l => `<div class="d-dart-breakdown-line">${Helpers.escapeHtml(l)}</div>`).join('')}</div>
                        </div>
                        <div class="d-dart-breakdown-section">
                            <div class="d-dart-breakdown-title">RECEIVER:</div>
                            <div class="d-dart-breakdown-content">${receiverBreakdown.map(l => `<div class="d-dart-breakdown-line">${Helpers.escapeHtml(l)}</div>`).join('')}</div>
                        </div>
                    </div>
                </div>
            `;
        },

        sowDetails(sowConfig, toggleId) {
            if (!sowConfig) return '';

            const items = [
                { label: '💰 Rate:', value: sowConfig.displayInfo?.rate || '-' },
                { label: '🔝 Max:', value: sowConfig.displayInfo?.max || '-' },
                { label: '⏱️ Billing:', value: sowConfig.displayInfo?.billingIncrement || '-' },
                { label: '📐 Round:', value: sowConfig.roundingRule || '-' },
                { label: '🔄 PU Live:', value: `${sowConfig.rules?.PICKUP?.LIVE?.eligible ? '✓' : '✗'} ${sowConfig.rules?.PICKUP?.LIVE?.freeTime || 0}m` },
                { label: '🪝 PU D&H:', value: `${sowConfig.rules?.PICKUP?.DROP_HOOK?.eligible ? '✓' : '✗'} ${sowConfig.rules?.PICKUP?.DROP_HOOK?.freeTime || 0}m` },
                { label: '🔄 DO Live:', value: `${sowConfig.rules?.DROP_OFF?.LIVE?.eligible ? '✓' : '✗'} ${sowConfig.rules?.DROP_OFF?.LIVE?.freeTime || 0}m` },
                { label: '🪝 DO D&H:', value: `${sowConfig.rules?.DROP_OFF?.DROP_HOOK?.eligible ? '✓' : '✗'} ${sowConfig.rules?.DROP_OFF?.DROP_HOOK?.freeTime || 0}m` }
            ];

            if (sowConfig.requiresApproval) items.push({ label: '⚠️ Approval:', value: 'Required', class: 'warning' });
            items.push({ label: '⚡ Auto:', value: sowConfig.autoChargeAllowed ? 'Enabled' : 'Disabled', class: sowConfig.autoChargeAllowed ? 'success' : 'disabled' });

            return `
                <div class="d-dart-sow-details" id="${toggleId}">
                    <div class="d-dart-sow-flex">
                        ${items.map(item => `<div class="d-dart-sow-item"><span class="d-dart-sow-item-label">${item.label}</span><span class="d-dart-sow-item-value ${item.class || ''}">${Helpers.escapeHtml(item.value)}</span></div>`).join('')}
                    </div>
                </div>
            `;
        },

        shipperCard(orderData) {
            const shipperName = orderData?.shipperName || 'Unknown';
            const truncatedName = Helpers.truncateText(shipperName, 25);
            const sowConfig = orderData?.sowConfig;
            const orderStatus = orderData?.viewData?.orderExecutionStatus || 'UNKNOWN';
            const statusInfo = DataHelpers.formatStatusDisplay(orderStatus);

            const orderId = orderData?.orderId || 'Unknown';
            const vrId = orderData?.viewData?.vehicleRunIds?.[0] || orderData?.smcExecutionData?.vehicleRunId || 'N/A';
            const tourId = orderData?.smcExecutionData?.tourId || 'N/A';

            const smcUrl = SecurityHelpers.buildSMCOrderUrl(orderId);
            const fmcVrUrl = SecurityHelpers.buildFMCSearchUrl(vrId);
            const fmcTourUrl = SecurityHelpers.buildFMCSearchUrl(tourId);

            const originCode = orderData?.smcExecutionData?.origin?.nodeCode || orderData?.fmcTimestamps?.origin?.stopCode || 'Unknown';
            const destCode = orderData?.smcExecutionData?.destination?.nodeCode || orderData?.fmcTimestamps?.destination?.stopCode || 'Unknown';

            const pricing = orderData?.viewData?.shipperPricing?.pricing || [];
            const holds = DataHelpers.findDetentionHolds(pricing);
            const sowToggleId = generateId('sow');

            return `
                <div class="d-dart-shipper-card">
                    <div class="d-dart-header-row">
                        <div class="d-dart-shipper-name" title="${Helpers.escapeHtml(shipperName)}">🏢 ${Helpers.escapeHtml(truncatedName)}</div>
                        <div class="d-dart-header-badges">
                            <span class="d-dart-status-badge" style="background-color:${Helpers.escapeHtml(statusInfo.color)}">${Helpers.escapeHtml(statusInfo.display)}</span>
                            ${sowConfig ? `<span class="d-dart-sow-badge" data-toggle-target="${sowToggleId}">SOW▼</span>` : '<span class="d-dart-sow-badge error">No SOW</span>'}
                        </div>
                    </div>
                    ${sowConfig ? this.sowDetails(sowConfig, sowToggleId) : ''}
                    <div class="d-dart-id-row">
                        <a href="${smcUrl}" target="_blank" rel="noopener noreferrer" class="d-dart-id-item">
                            <div class="d-dart-id-content"><span class="d-dart-id-label">Order</span><span class="d-dart-id-value">📋 ${Helpers.escapeHtml(orderId)}</span></div>
                        </a>
                        <a href="${fmcVrUrl}" target="_blank" rel="noopener noreferrer" class="d-dart-id-item">
                            <div class="d-dart-id-content"><span class="d-dart-id-label">VR</span><span class="d-dart-id-value">🚛 ${Helpers.escapeHtml(vrId)}</span></div>
                        </a>
                        <a href="${fmcTourUrl}" target="_blank" rel="noopener noreferrer" class="d-dart-id-item">
                            <div class="d-dart-id-content"><span class="d-dart-id-label">Tour</span><span class="d-dart-id-value">🔗 ${Helpers.escapeHtml(tourId)}</span></div>
                        </a>
                    </div>
                    <div class="d-dart-lane-row">
                        <span class="d-dart-lane-origin">📍 ${Helpers.escapeHtml(originCode)}</span>
                        <div class="d-dart-lane-arrow-container"><span class="d-dart-arrow-static">────►────</span></div>
                        <span class="d-dart-lane-dest">${Helpers.escapeHtml(destCode)}</span>
                    </div>
                    <div class="d-dart-holds-row">
                        <span class="d-dart-holds-label">HOLDS:</span>
                        <span class="d-dart-hold-item ${holds.shipperExists ? 'has-hold' : 'no-hold'}">${holds.shipperExists ? '🟢' : '🔴'} Shipper: ${holds.shipperExists ? '$' + holds.shipperAmount.toFixed(2) : 'No'}</span>
                        <span class="d-dart-hold-item ${holds.receiverExists ? 'has-hold' : 'no-hold'}">${holds.receiverExists ? '🟢' : '🔴'} Receiver: ${holds.receiverExists ? '$' + holds.receiverAmount.toFixed(2) : 'No'}</span>
                    </div>
                </div>
            `;
        },

        getStopTimestamps(analysis, timezone) {
            const result = {
                arrival: { planned: '-', actual: '-', delay: null, delayClass: CSS_CLASSES.PENDING, borrowedVrId: null },
                departure: { planned: '-', actual: '-', delay: null, delayClass: CSS_CLASSES.PENDING, borrowedVrId: null }
            };

            if (!analysis?.fmcStopData?.timestamps) return result;

            const ts = analysis.fmcStopData.timestamps;

            if (ts.plannedYardArrival) result.arrival.planned = Helpers.formatTimeFromEpoch(ts.plannedYardArrival, timezone);
            if (ts.actualYardArrival) {
                result.arrival.actual = Helpers.formatTimeFromEpoch(ts.actualYardArrival, timezone);
                result.arrival.borrowedVrId = ts.actualYardArrivalSourceVrId;
                if (ts.plannedYardArrival) {
                    const diff = DataHelpers.calculateTimeDiff(ts.plannedYardArrival, ts.actualYardArrival);
                    result.arrival.delay = diff.minutes;
                    result.arrival.delayClass = diff.minutes > 0 ? CSS_CLASSES.LATE : CSS_CLASSES.EARLY;
                }
            }

            if (ts.plannedYardDeparture) result.departure.planned = Helpers.formatTimeFromEpoch(ts.plannedYardDeparture, timezone);
            if (ts.actualYardDeparture) {
                result.departure.actual = Helpers.formatTimeFromEpoch(ts.actualYardDeparture, timezone);
                result.departure.borrowedVrId = ts.actualYardDepartureSourceVrId;
                if (ts.plannedYardDeparture) {
                    const diff = DataHelpers.calculateTimeDiff(ts.plannedYardDeparture, ts.actualYardDeparture);
                    result.departure.delay = diff.minutes;
                    result.departure.delayClass = diff.minutes > 0 ? CSS_CLASSES.LATE : CSS_CLASSES.EARLY;
                }
            }

            return result;
        },

        timestampBox(label, data) {
            let delayText = '-', delayLabel = '-';
            if (data.delay !== null) {
                const absMinutes = Math.abs(data.delay);
                delayText = absMinutes >= 60 ? `${Math.floor(absMinutes / 60)}h ${absMinutes % 60}m` : `${absMinutes}m`;
                delayLabel = data.delay < 0 ? 'EARLY' : data.delay > 0 ? 'DELAY' : 'ON TIME';
            }

            const borrowedHtml = data.borrowedVrId ? `<div class="d-dart-borrowed-indicator">📍 ${Helpers.escapeHtml(Helpers.truncateText(data.borrowedVrId, 15))}</div>` : '';

            return `
                <div class="d-dart-ts-box">
                    <div class="d-dart-ts-col planned"><div class="d-dart-ts-col-label">${Helpers.escapeHtml(label)} Planned</div><div class="d-dart-ts-col-value">${Helpers.escapeHtml(data.planned)}</div></div>
                    <div class="d-dart-ts-col actual"><div class="d-dart-ts-col-label">${Helpers.escapeHtml(label)} Actual</div><div class="d-dart-ts-col-value">${Helpers.escapeHtml(data.actual)}</div>${borrowedHtml}</div>
                    <div class="d-dart-ts-col delay ${data.delayClass}"><div class="d-dart-ts-col-label">${delayLabel}</div><div class="d-dart-ts-col-value">${delayText}</div></div>
                </div>
            `;
        },

        stopCard(stop, analysis, sowConfig, smcExecutionData) {
            const stopTypeInfo = analysis?.stopType || DataHelpers.formatStopType(stop?.stopActionType);
            const loadTypeInfo = DataHelpers.formatLoadType(stop?.loadingType);

            let timezone = 'America/Chicago';
            if (analysis?.fmcStopData) timezone = analysis.fmcStopData.timezone || timezone;
            else if (smcExecutionData) timezone = stopTypeInfo.isPickup ? smcExecutionData.origin?.timezone : smcExecutionData.destination?.timezone;

            const stopName = stop?.stopName || analysis?.stopName || `Stop ${(analysis?.stopIndex || 0) + 1}`;
            const fmcTimestamps = this.getStopTimestamps(analysis, timezone);

            return `
                <div class="d-dart-stop-card">
                    <div class="d-dart-stop-header">
                        <div class="d-dart-stop-title">Stop ${(analysis?.stopIndex || 0) + 1}: ${Helpers.escapeHtml(stopName)}</div>
                        <div class="d-dart-stop-badges">
                            <span class="d-dart-stop-badge ${stopTypeInfo.class}">${Helpers.escapeHtml(stopTypeInfo.label)}</span>
                            <span class="d-dart-stop-badge load-type">${loadTypeInfo.icon} ${Helpers.escapeHtml(loadTypeInfo.display)}</span>
                        </div>
                    </div>
                    <div class="d-dart-timestamp-boxes">
                        ${this.timestampBox('Arrival', fmcTimestamps.arrival)}
                        ${this.timestampBox('Departure', fmcTimestamps.departure)}
                    </div>
                </div>
            `;
        },

        batchReportTable(data) {
            if (!data?.length) return '<div class="d-dart-empty">No results</div>';

            const stats = {
                recovered: data.filter(d => d.action === ActionDisplayConfig.RECOVERED.reportTerm).length,
                chargesAdded: data.filter(d => d.action === ActionDisplayConfig.CHARGE_ADDED.reportTerm).length,
                holdsReleased: data.filter(d => d.action === ActionDisplayConfig.HOLD_RELEASED.reportTerm).length,
                analysisOnly: data.filter(d => d.action === ActionDisplayConfig.ANALYSIS_ONLY.reportTerm).length,
                pending: data.filter(d => d.action === ActionDisplayConfig.PENDING.reportTerm).length,
                errors: data.filter(d => d.status === 'Error').length
            };

            const rowsHtml = data.map(row => {
                let statusClass = row.status === 'Completed' ? 'success' : row.status === 'Pending' ? 'pending' : row.status === 'Error' ? 'error' : row.status === 'Info' ? 'analysis' : '';
                let actionClass = row.action === ActionDisplayConfig.RECOVERED.reportTerm ? 'recovered' : row.action === ActionDisplayConfig.ANALYSIS_ONLY.reportTerm ? 'analysis' : '';
                return `<tr class="${statusClass} ${actionClass}">
                    <td class="d-dart-order-cell">${Helpers.escapeHtml(row.orderId)}</td>
                    <td>${Helpers.escapeHtml(Helpers.truncateText(row.shipper, 15))}</td>
                    <td>${Helpers.escapeHtml(row.action)}</td>
                    <td>${Helpers.escapeHtml(row.amount)}</td>
                    <td><span class="d-dart-status-badge ${statusClass}">${Helpers.escapeHtml(row.status)}</span></td>
                </tr>`;
            }).join('');

            return `
                <div class="d-dart-batch-summary">
                    <div class="d-dart-batch-stat recovered">🎯 ${stats.recovered}</div>
                    <div class="d-dart-batch-stat success">✅ ${stats.chargesAdded}</div>
                    <div class="d-dart-batch-stat released">✅ ${stats.holdsReleased}</div>
                    <div class="d-dart-batch-stat analysis">📊 ${stats.analysisOnly}</div>
                    <div class="d-dart-batch-stat pending">⏳ ${stats.pending}</div>
                    <div class="d-dart-batch-stat error">❌ ${stats.errors}</div>
                </div>
                <div class="d-dart-batch-table-container">
                    <table class="d-dart-batch-table">
                        <thead><tr><th>Order</th><th>Shipper</th><th>Action</th><th>Amount</th><th>Status</th></tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
                <div class="d-dart-download-buttons">
                    <button class="d-dart-download-btn" id="d-dart-download-csv">📥 CSV</button>
                    <button class="d-dart-download-btn" id="d-dart-download-txt">📄 TXT</button>
                </div>
            `;
        },

        enhancedBatchProgress(totalOrders, totalChunks) {
            return `
                <div class="d-dart-enhanced-progress">
                    <div class="d-dart-progress-header">
                        <div class="d-dart-progress-title">🔄 Batch Processing</div>
                        <div class="d-dart-progress-controls">
                            <button class="d-dart-control-btn" id="d-dart-pause-btn" title="Pause">⏸️</button>
                            <button class="d-dart-control-btn" id="d-dart-resume-btn" title="Resume" style="display:none">▶️</button>
                            <button class="d-dart-control-btn cancel" id="d-dart-cancel-btn" title="Cancel">⏹️</button>
                        </div>
                    </div>
                    <div class="d-dart-progress-stats">
                        <div class="d-dart-stat"><span class="d-dart-stat-value" id="d-dart-stat-processed">0</span><span class="d-dart-stat-label">Processed</span></div>
                        <div class="d-dart-stat success"><span class="d-dart-stat-value" id="d-dart-stat-success">0</span><span class="d-dart-stat-label">Success</span></div>
                        <div class="d-dart-stat error"><span class="d-dart-stat-value" id="d-dart-stat-failed">0</span><span class="d-dart-stat-label">Failed</span></div>
                        <div class="d-dart-stat"><span class="d-dart-stat-value" id="d-dart-stat-remaining">${totalOrders}</span><span class="d-dart-stat-label">Remaining</span></div>
                    </div>
                    <div class="d-dart-progress-bar-container"><div class="d-dart-progress-bar" id="d-dart-progress-bar" style="width: 0%"></div></div>
                    <div class="d-dart-progress-info">
                        <div class="d-dart-progress-status" id="d-dart-progress-status">Initializing...</div>
                        <div class="d-dart-progress-eta" id="d-dart-progress-eta"></div>
                    </div>
                    <div class="d-dart-progress-footer">
                        <div class="d-dart-progress-chunk">Chunk: <span id="d-dart-chunk-info">0/${totalChunks}</span></div>
                        <div class="d-dart-progress-token">Token: <span id="d-dart-token-status" class="token-ok">Ready</span></div>
                    </div>
                </div>
            `;
        },

        sowErrorDisplay(errorMessage, isAuthError = false) {
            return `
                <div class="d-dart-sow-error" role="alert">
                    <div class="d-dart-sow-error-icon">${isAuthError ? '🔐' : '❌'}</div>
                    <div class="d-dart-sow-error-title">${isAuthError ? 'SharePoint Login Required' : 'SOW Unavailable'}</div>
                    <div class="d-dart-sow-error-message">${Helpers.escapeHtml(errorMessage)}</div>
                    ${isAuthError ? `
                        <div class="d-dart-sow-error-instructions">
                            <p>1. Click below to open SharePoint</p>
                            <p>2. Login with your credentials</p>
                            <p>3. Click "Retry"</p>
                        </div>
                        <a href="${CONFIG.SHAREPOINT.SITE_URL}" target="_blank" rel="noopener noreferrer" class="d-dart-sow-login-btn">🔗 Open SharePoint</a>
                    ` : ''}
                    <button class="d-dart-sow-retry-btn" id="d-dart-sow-retry">🔄 Retry</button>
                </div>
            `;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 30: REPORT GENERATOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ReportGenerator = {
        generateCSV(data) {
            const headers = ['Order ID', 'Shipper', 'Action', 'Amount', 'Status', 'Notes'];
            const rows = data.map(row => [
                row.orderId,
                `"${String(row.shipper || '').replace(/"/g, '""')}"`,
                row.action,
                row.amount,
                row.status,
                `"${String(row.notes || '').replace(/"/g, '""')}"`
            ].join(','));
            return [headers.join(','), ...rows].join('\n');
        },

        generateTXT(data) {
            const now = new Date().toLocaleString();
            const separator = '═'.repeat(60);

            const stats = {
                recovered: data.filter(d => d.action === ActionDisplayConfig.RECOVERED.reportTerm).length,
                chargesAdded: data.filter(d => d.action === ActionDisplayConfig.CHARGE_ADDED.reportTerm).length,
                holdsReleased: data.filter(d => d.action === ActionDisplayConfig.HOLD_RELEASED.reportTerm).length,
                analysisOnly: data.filter(d => d.action === ActionDisplayConfig.ANALYSIS_ONLY.reportTerm).length,
                pending: data.filter(d => d.action === ActionDisplayConfig.PENDING.reportTerm).length,
                errors: data.filter(d => d.status === 'Error').length
            };

            let report = `
${separator}
    D-DART Batch Report v${CONFIG.VERSION}
${separator}
Generated: ${now}
Total: ${data.length}
${separator}

SUMMARY:
  🎯 Recovered: ${stats.recovered}
  ✅ Charges Added: ${stats.chargesAdded}
  ✅ Holds Released: ${stats.holdsReleased}
  📊 Analysis Only: ${stats.analysisOnly}
  ⏳ Pending: ${stats.pending}
  ❌ Errors: ${stats.errors}

${separator}
DETAILS:
`;
            data.forEach((row, i) => {
                report += `\n${i + 1}. ${row.orderId} | ${row.shipper} | ${row.action} | ${row.amount} | ${row.status}${row.notes ? ` | ${row.notes}` : ''}`;
            });

            return report.trim();
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 31: APPROVAL POPUP
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ApprovalPopup = (() => {
        let currentPopup = null;
        let timeoutId = null;
        let countdownInterval = null;
        let resolveCallback = null;
        let mutationObserver = null;

        const cleanup = () => {
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
            if (currentPopup) { currentPopup.remove(); currentPopup = null; }
        };

        const handleDecision = (decision, authNumber = null) => {
            cleanup();
            if (resolveCallback) {
                resolveCallback({ decision, authorizationNumber: authNumber });
                resolveCallback = null;
            }
        };

        const startCountdown = () => {
            let secondsLeft = Math.floor(CONFIG.APPROVAL.TIMEOUT / 1000);
            const timerEl = document.getElementById('d-dart-approval-timer');

            countdownInterval = setInterval(() => {
                secondsLeft--;
                if (timerEl) {
                    timerEl.textContent = `⏱️ ${secondsLeft}s`;
                    timerEl.classList.remove('warning', 'critical');
                    if (secondsLeft <= CONFIG.APPROVAL.WARNING_TIME) timerEl.classList.add('warning');
                    if (secondsLeft <= CONFIG.APPROVAL.CRITICAL_TIME) timerEl.classList.add('critical');
                }
                if (secondsLeft <= 0) handleDecision('TIMEOUT');
            }, CONFIG.APPROVAL.COUNTDOWN_INTERVAL);

            timeoutId = setTimeout(() => handleDecision('TIMEOUT'), CONFIG.APPROVAL.TIMEOUT);
        };

        const showAuthInput = (orderData, totalCharge) => {
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

            const popup = currentPopup?.querySelector('.d-dart-approval-popup');
            if (!popup) return;

            popup.innerHTML = `
                <div class="d-dart-approval-header"><span class="d-dart-approval-title">✅ AUTHORIZATION</span></div>
                <div class="d-dart-approval-body">
                    <div class="d-dart-approval-order-id"><span class="d-dart-approval-label">Order:</span><span class="d-dart-approval-value">${Helpers.escapeHtml(orderData?.orderId)}</span></div>
                    <div class="d-dart-approval-charge-confirm"><span class="d-dart-approval-label">Amount:</span><span class="d-dart-approval-value">${Helpers.formatCurrency(totalCharge)}</span></div>
                    <div class="d-dart-approval-auth-section">
                        <label class="d-dart-approval-auth-label">Authorization Number:</label>
                        <input type="text" class="d-dart-approval-auth-input" id="d-dart-approval-auth-input" placeholder="Enter auth number">
                        <div class="d-dart-approval-auth-error" id="d-dart-approval-auth-error"></div>
                    </div>
                </div>
                <div class="d-dart-approval-buttons">
                    <button class="d-dart-approval-btn submit" id="d-dart-approval-submit">SUBMIT</button>
                    <button class="d-dart-approval-btn cancel" id="d-dart-approval-cancel">CANCEL</button>
                </div>
            `;

            const authInput = document.getElementById('d-dart-approval-auth-input');
            const authError = document.getElementById('d-dart-approval-auth-error');

            setTimeout(() => authInput?.focus(), 100);

            const handleSubmit = () => {
                const authNumber = Validator.sanitizeAuthNumber(authInput?.value);
                if (!authNumber) {
                    if (authError) authError.textContent = Messages.ERRORS.AUTH_NUMBER_REQUIRED;
                    authInput?.classList.add('error');
                    return;
                }
                handleDecision('YES', authNumber);
            };

            document.getElementById('d-dart-approval-submit')?.addEventListener('click', handleSubmit);
            document.getElementById('d-dart-approval-cancel')?.addEventListener('click', () => handleDecision('SKIP'));
            authInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });
            authInput?.addEventListener('input', () => { if (authError) authError.textContent = ''; authInput?.classList.remove('error'); });
        };

        const createPopup = (orderData, totalCharge, stopDetails) => {
            cleanup();

            const requiresAuth = orderData?.sowConfig?.authNumberRequired || false;

            const overlay = document.createElement('div');
            overlay.id = 'd-dart-approval-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            overlay.innerHTML = `
                <div class="d-dart-approval-popup">
                    <div class="d-dart-approval-header">
                        <span class="d-dart-approval-title">⚠️ APPROVAL REQUIRED</span>
                        <span class="d-dart-approval-timer" id="d-dart-approval-timer">⏱️ ${Math.floor(CONFIG.APPROVAL.TIMEOUT / 1000)}s</span>
                    </div>
                    <div class="d-dart-approval-body">
                        <div class="d-dart-approval-order-id"><span class="d-dart-approval-label">Order:</span><span class="d-dart-approval-value">${Helpers.escapeHtml(orderData?.orderId)}</span></div>
                        <div class="d-dart-approval-shipper"><span class="d-dart-approval-label">Shipper:</span><span class="d-dart-approval-value">${Helpers.escapeHtml(orderData?.shipperName)}</span></div>
                        <div class="d-dart-approval-charge-info">
                            <div class="d-dart-approval-charge-title">Detention charge detected:</div>
                            <div class="d-dart-approval-charge-details">
                                ${stopDetails.map(s => `<div class="d-dart-approval-stop-line">📍 ${Helpers.escapeHtml(s.stopType)}: <strong>${Helpers.formatCurrency(s.charge)}</strong></div>`).join('')}
                            </div>
                            <div class="d-dart-approval-total"><span class="d-dart-approval-total-label">Total:</span><span class="d-dart-approval-total-value">${Helpers.formatCurrency(totalCharge)}</span></div>
                        </div>
                        <div class="d-dart-approval-question">Approve this charge?</div>
                    </div>
                    <div class="d-dart-approval-buttons">
                        <button class="d-dart-approval-btn yes" id="d-dart-approval-yes">✅ YES</button>
                        <button class="d-dart-approval-btn no" id="d-dart-approval-no">❌ NO</button>
                        <button class="d-dart-approval-btn skip" id="d-dart-approval-skip">⏭️ SKIP</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            currentPopup = overlay;

            // Setup observer for external removal
            mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.removedNodes) {
                        if (node === currentPopup || node.contains?.(currentPopup)) {
                            if (countdownInterval) clearInterval(countdownInterval);
                            if (timeoutId) clearTimeout(timeoutId);
                            mutationObserver?.disconnect();
                            if (resolveCallback) { resolveCallback({ decision: 'SKIP' }); resolveCallback = null; }
                            currentPopup = null;
                            return;
                        }
                    }
                }
            });
            mutationObserver.observe(document.body, { childList: true, subtree: true });

            document.getElementById('d-dart-approval-yes')?.addEventListener('click', () => {
                if (requiresAuth) showAuthInput(orderData, totalCharge);
                else handleDecision('YES');
            });
            document.getElementById('d-dart-approval-no')?.addEventListener('click', () => handleDecision('NO'));
            document.getElementById('d-dart-approval-skip')?.addEventListener('click', () => handleDecision('SKIP'));
            overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') handleDecision('SKIP'); });

            document.getElementById('d-dart-approval-yes')?.focus();
        };

        return {
            show(orderData, totalCharge, stopDetails) {
                return new Promise((resolve) => {
                    resolveCallback = resolve;
                    createPopup(orderData, totalCharge, stopDetails);
                    startCountdown();
                });
            },
            cleanup
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 32: BATCH PROCESSOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const BatchProcessor = (() => {
        let batchState = BatchState.IDLE;
        let startTime = null;
        let lastUIUpdate = 0;

        const initializeOrderData = (orderId) => ({
            orderId,
            viewData: null,
            fullData: null,
            smcExecutionData: null,
            fmcData: null,
            fmcTimestamps: null,
            analysisResults: [],
            shipperName: 'Unknown',
            sowConfig: null
        });

        const analyzeStops = (orderData) => {
            const stops = orderData?.viewData?.stops || [];
            const pricing = orderData?.viewData?.shipperPricing?.pricing || [];
            const orderStatus = orderData?.viewData?.orderExecutionStatus || 'UNKNOWN';
            const holdInfo = DataHelpers.findDetentionHolds(pricing);

            for (let index = 0, len = stops.length; index < len; index++) {
                const stop = stops[index];
                const stopTypeInfo = DataHelpers.formatStopType(stop?.stopActionType);
                let fmcStopTimestamps = null;

                if (orderData.fmcTimestamps) {
                    fmcStopTimestamps = stopTypeInfo.isPickup ? orderData.fmcTimestamps.origin : orderData.fmcTimestamps.destination;
                }

                const analysis = DetentionAnalyzer.analyze(stop, fmcStopTimestamps, orderData.sowConfig, orderStatus, holdInfo, index, orderData.shipperName);
                analysis.stopIndex = index;
                analysis.stopName = stop?.stopName || `Stop ${index + 1}`;
                analysis.stopType = stopTypeInfo;
                analysis.stop = stop;
                analysis.fmcStopData = fmcStopTimestamps;

                orderData.analysisResults.push(analysis);
            }
        };

        const addToBatchReport = (orderData) => {
            const entry = {
                orderId: orderData?.orderId || 'Unknown',
                shipper: orderData?.shipperName || 'Unknown',
                action: ActionDisplayConfig.NO_ACTION.reportTerm,
                amount: '$0.00',
                status: 'Completed',
                notes: ''
            };

            let totalCharge = 0;
            let hasError = false, hasPending = false, hasChargeAdded = false, hasRecovered = false, hasHoldReleased = false, hasAnalysisOnly = false;
            const notesList = [];

            for (const analysis of (orderData?.analysisResults || [])) {
                if (analysis?.processedAmount > 0) totalCharge += analysis.processedAmount;
                else if (analysis?.charge > 0 && analysis?.processed) totalCharge += analysis.charge;
                else if (analysis?.charge > 0 && analysis?.action === ActionType.ANALYSIS_ONLY) { totalCharge += analysis.charge; hasAnalysisOnly = true; }

                if (analysis?.processError) { hasError = true; notesList.push(analysis.processError); }
                else if (analysis?.action === ActionType.PENDING || analysis?.action === ActionType.ERROR) { hasPending = true; notesList.push(analysis.actionText || 'Pending'); }

                if (analysis?.processed) {
                    switch (analysis.processedAction) {
                        case 'updated': hasChargeAdded = true; break;
                        case 'created': hasRecovered = true; break;
                        case 'released': hasHoldReleased = true; break;
                        case 'skipped':
                        case 'timeout': hasPending = true; break;
                        case 'analysis_only': hasAnalysisOnly = true; break;
                    }
                }

                if (analysis?.type === ResultType.CHARGE_EXISTS) notesList.push(`Existing: $${(analysis.charge || 0).toFixed(2)}`);
                else if (analysis?.type === ResultType.DRIVER_LATE) notesList.push('Driver late');
                else if (analysis?.type === ResultType.NO_DETENTION_DROP_HOOK) notesList.push('Not eligible');
                else if (analysis?.type === ResultType.BELOW_MINIMUM_THRESHOLD) notesList.push('Below minimum');
            }

            if (hasRecovered) { entry.action = ActionDisplayConfig.RECOVERED.reportTerm; entry.amount = Helpers.formatCurrency(totalCharge); }
            else if (hasChargeAdded) { entry.action = ActionDisplayConfig.CHARGE_ADDED.reportTerm; entry.amount = Helpers.formatCurrency(totalCharge); }
            else if (hasHoldReleased) { entry.action = ActionDisplayConfig.HOLD_RELEASED.reportTerm; entry.amount = '$0.00'; }
            else if (hasAnalysisOnly) { entry.action = ActionDisplayConfig.ANALYSIS_ONLY.reportTerm; entry.amount = totalCharge > 0 ? Helpers.formatCurrency(totalCharge) : '-'; entry.status = 'Info'; notesList.push('Auto-charge disabled'); }
            else if (hasPending) { entry.action = ActionDisplayConfig.PENDING.reportTerm; entry.amount = totalCharge > 0 ? Helpers.formatCurrency(totalCharge) : '-'; }

            if (hasError) entry.status = 'Error';
            else if (hasPending) entry.status = 'Pending';

            entry.notes = notesList.join('; ');
            AppState.addBatchReportEntry(entry);
        };

        const executeActions = async (orderData) => {
            const orderId = orderData?.orderId;
            if (!orderId) return;

            let chargeAdded = false, releaseProcessed = false;

            const releaseActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.RELEASE_HOLD);
            const updateActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.ADD_CHARGE_UPDATE);
            const createActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.ADD_CHARGE_CREATE);

            const needsFullData = releaseActions.length > 0 || updateActions.length > 0 || createActions.length > 0;
            if (!needsFullData) return;

            if (!orderData.fullData) orderData.fullData = await SMCApiService.fetchOrderFull(orderId);

            let currentVersion = orderData.fullData?.orderId?.version;

            // Handle updates and releases
            if (releaseActions.length > 0 || updateActions.length > 0) {
                const pricing = [...(orderData.fullData?.orderDetails?.shipperPricing?.pricing || [])];
                let modified = false;

                for (const analysis of updateActions) {
                    if (analysis?.holdCode) {
                        const idx = pricing.findIndex(p => p?.pricingCode === analysis.holdCode);
                        if (idx !== -1) {
                            pricing[idx] = { ...pricing[idx], price: { ...pricing[idx].price, value: analysis.charge } };
                            analysis.processed = true;
                            analysis.processedAction = 'updated';
                            analysis.processedAmount = analysis.charge;
                            modified = true;
                            chargeAdded = true;
                        }
                    }
                }

                for (const analysis of releaseActions) {
                    if (analysis?.holdCode) {
                        const idx = pricing.findIndex(p => p?.pricingCode === analysis.holdCode);
                        if (idx !== -1) {
                            pricing.splice(idx, 1);
                            analysis.processed = true;
                            analysis.processedAction = 'released';
                            modified = true;
                            releaseProcessed = true;
                        }
                    }
                }

                if (modified) {
                    await SMCApiService.updateOrder(orderData.fullData, pricing);
                    if (createActions.length > 0) {
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        currentVersion = orderData.fullData?.orderId?.version;
                    }
                }
            }

            // Handle creates
            for (const analysis of createActions) {
                try {
                    const pricingConfig = DataHelpers.getDetentionPricingConfig(analysis.isPickup);
                    await SMCApiService.addPricingLine(orderId, currentVersion, pricingConfig, analysis.charge);
                    analysis.processed = true;
                    analysis.processedAction = 'created';
                    analysis.processedAmount = analysis.charge;
                    chargeAdded = true;

                    if (createActions.indexOf(analysis) < createActions.length - 1) {
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        currentVersion = orderData.fullData?.orderId?.version;
                    }
                } catch (error) {
                    analysis.processed = false;
                    analysis.processError = error.message;
                }
            }

            // Add comment
            if (chargeAdded) await SMCApiService.addComment(orderId, Messages.COMMENTS.ADD_CHARGE);
            else if (releaseProcessed) await SMCApiService.addComment(orderId, Messages.COMMENTS.RELEASE_HOLD);

            PerformanceMonitor.recordOrderProcessed();
        };

        const processSingleOrder = async (orderId, isBatchMode = false) => {
            const orderData = initializeOrderData(orderId);

            const [viewData, smcExecResult] = await Promise.all([
                HttpClient.request({ method: 'GET', url: `${CONFIG.URLS.SMC_BASE}/shipper/order/view/${encodeURIComponent(orderId)}`, headers: { 'Accept': 'application/json' } }, 'Order View', circuitBreakers.smc),
                ErrorHandler.wrap(() => FMCApiService.fetchSMCExecution(orderId), ErrorType.NETWORK, null, false)
            ]);

            orderData.viewData = viewData;
            orderData.smcExecutionData = smcExecResult;
            orderData.shipperName = viewData?.shipperDetails?.shipperName || 'Unknown';

            const sowValidation = SOWConfigManager.validateShipper(orderData.shipperName);
            if (!sowValidation.valid) {
                if (!isBatchMode) throw ErrorHandler.create(ErrorType.SOW, sowValidation.error);
                AppState.addBatchReportEntry({ orderId, shipper: orderData.shipperName, action: ActionDisplayConfig.ERROR.reportTerm, amount: '-', status: 'Error', notes: sowValidation.error });
                return null;
            }

            orderData.sowConfig = sowValidation.config;

            if (orderData.smcExecutionData?.tourId) {
                try {
                    orderData.fmcData = await FMCApiService.fetchFMCByTourId(orderData.smcExecutionData.tourId);
                    const matchingVR = FMCApiService.findMatchingVR(orderData.fmcData?.records, orderData.smcExecutionData.contractedLane);
                    if (matchingVR) {
                        orderData.fmcTimestamps = FMCApiService.extractTimestamps(matchingVR);
                        if (orderData.fmcTimestamps) {
                            orderData.fmcTimestamps = FMCApiService.fillMissingTimestampsFromTour(orderData.fmcTimestamps, orderData.fmcData?.records, matchingVR.vehicleRunId);
                        }
                    }
                } catch (e) { orderData.fmcTimestamps = null; }
            }

            analyzeStops(orderData);

            const pendingApprovals = orderData.analysisResults.filter(r => r?.action === ActionType.PENDING_APPROVAL);
            if (pendingApprovals.length > 0 && isBatchMode) {
                AppState.addPendingApprovalOrder(orderData);
                return orderData;
            }

            const actionsNeeded = orderData.analysisResults.filter(r =>
                r?.action === ActionType.ADD_CHARGE_UPDATE || r?.action === ActionType.ADD_CHARGE_CREATE || r?.action === ActionType.RELEASE_HOLD
            );

            if (actionsNeeded.length > 0) {
                orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                await executeActions(orderData);
            }

            addToBatchReport(orderData);
            CacheManager.invalidate(orderId);

            return orderData;
        };

        const processOrderWithRetry = async (orderId, attempt = 1) => {
            try {
                return await processSingleOrder(orderId, true);
            } catch (error) {
                if (ErrorHandler.isRateLimitError(error)) await sleep(CONFIG.BATCH.RATE_LIMIT_DELAY * 3);
                if (attempt < CONFIG.API.MAX_RETRIES && ErrorHandler.isRetryableError(error)) {
                    await sleep(CONFIG.BATCH.RATE_LIMIT_DELAY * attempt);
                    return processOrderWithRetry(orderId, attempt + 1);
                }
                throw error;
            }
        };

        const throttledUIUpdate = () => {
            const now = Date.now();
            if (now - lastUIUpdate < CONFIG.BATCH.UI_UPDATE_INTERVAL) return;
            lastUIUpdate = now;

            const processedOrders = AppState.get('processedOrders');
            const failedOrders = AppState.get('failedOrders');
            const totalOrders = AppState.get('totalOrders');

            EventBus.emit('batchProgressUpdate', {
                processed: processedOrders.size + failedOrders.length,
                success: processedOrders.size,
                failed: failedOrders.length,
                total: totalOrders,
                startTime
            });
        };

        const processChunk = async (chunk) => {
            const parallelBatches = chunkArray(chunk, CONFIG.BATCH.PARALLEL_SIZE);

            for (const parallelBatch of parallelBatches) {
                if (batchState === BatchState.CANCELLED || batchState === BatchState.PAUSED) break;

                const results = await Promise.allSettled(parallelBatch.map(orderId => processOrderWithRetry(orderId)));

                for (let i = 0, len = results.length; i < len; i++) {
                    const orderId = parallelBatch[i];
                    const result = results[i];

                    if (result.status === 'fulfilled' && result.value) {
                        AppState.addProcessedOrder(orderId, result.value);
                    } else {
                        const errorMsg = result.reason?.message || 'Unknown error';
                        AppState.addFailedOrder(orderId, errorMsg);
                        AppState.addBatchReportEntry({ orderId, shipper: 'Unknown', action: ActionDisplayConfig.ERROR.reportTerm, amount: '-', status: 'Error', notes: errorMsg });
                    }

                    throttledUIUpdate();
                }

                if (batchState === BatchState.RUNNING) await sleep(CONFIG.BATCH.RATE_LIMIT_DELAY);
            }
        };

        const handleApprovalFlow = async (orderData, pendingApprovals) => {
            // Ensure holds exist
            if (!orderData.fullData) orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);

            const pricing = orderData.fullData?.orderDetails?.shipperPricing?.pricing || [];
            const holdInfo = DataHelpers.findDetentionHolds(pricing);

            for (const analysis of pendingApprovals) {
                const holdExists = analysis?.isPickup ? holdInfo.shipperExists : holdInfo.receiverExists;
                if (!holdExists) {
                    const pricingConfig = DataHelpers.getDetentionPricingConfig(analysis.isPickup);
                    try {
                        await SMCApiService.addPricingLine(orderData.orderId, orderData.fullData?.orderId?.version, pricingConfig, 0);
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);
                        analysis.hasHold = true;
                        analysis.holdCode = pricingConfig.pricingCode;
                    } catch (e) { Logger.error('Failed to create $0 hold', e.message); }
                }
            }

            const totalCharge = pendingApprovals.reduce((sum, a) => sum + (a?.charge || 0), 0);
            const stopDetails = pendingApprovals.map(a => ({ stopType: a?.isPickup ? 'SHIPPER' : 'RECEIVER', charge: a?.charge || 0 }));

            const decision = await ApprovalPopup.show(orderData, totalCharge, stopDetails);

            // Process decision
            orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);

            if (decision.decision === 'YES') {
                const pricing = [...(orderData.fullData?.orderDetails?.shipperPricing?.pricing || [])];
                let modified = false;

                for (const analysis of pendingApprovals) {
                    const idx = pricing.findIndex(p => {
                        const code = String(p?.pricingCode || '').toUpperCase();
                        const isDetention = code.includes('DETENTION');
                        const matchesType = analysis?.isPickup ? (code.includes('SHIPPER') || code.includes('ORIGIN')) : (code.includes('RECEIVER') || code.includes('DESTINATION'));
                        return isDetention && matchesType;
                    });

                    if (idx !== -1) {
                        pricing[idx] = { ...pricing[idx], price: { ...pricing[idx].price, value: analysis?.charge || 0 } };
                        analysis.processed = true;
                        analysis.processedAction = 'updated';
                        analysis.processedAmount = analysis?.charge || 0;
                        modified = true;
                    }
                }

                if (modified) {
                    await SMCApiService.updateOrder(orderData.fullData, pricing);
                    const comment = decision.authorizationNumber ? Messages.COMMENTS.CHARGE_WITH_AUTH(decision.authorizationNumber) : Messages.COMMENTS.ADD_CHARGE;
                    await SMCApiService.addComment(orderData.orderId, comment);
                }
            } else if (decision.decision === 'NO') {
                const pricing = [...(orderData.fullData?.orderDetails?.shipperPricing?.pricing || [])];
                let modified = false;

                for (const analysis of pendingApprovals) {
                    const idx = pricing.findIndex(p => {
                        const code = String(p?.pricingCode || '').toUpperCase();
                        const isDetention = code.includes('DETENTION');
                        const matchesType = analysis?.isPickup ? (code.includes('SHIPPER') || code.includes('ORIGIN')) : (code.includes('RECEIVER') || code.includes('DESTINATION'));
                        return isDetention && matchesType;
                    });

                    if (idx !== -1) {
                        pricing.splice(idx, 1);
                        analysis.processed = true;
                        analysis.processedAction = 'released';
                        modified = true;
                    }
                }

                if (modified) {
                    await SMCApiService.updateOrder(orderData.fullData, pricing);
                    await SMCApiService.addComment(orderData.orderId, Messages.COMMENTS.APPROVAL_DECLINED);
                }
            } else {
                for (const analysis of pendingApprovals) {
                    analysis.processed = true;
                    analysis.processedAction = decision.decision === 'SKIP' ? 'skipped' : 'timeout';
                }
            }
        };

        const processPendingApprovalOrders = async () => {
            const pendingOrders = AppState.get('pendingApprovalOrders');
            if (pendingOrders.length === 0) return;

            EventBus.emit('batchStatusUpdate', `Processing ${pendingOrders.length} orders requiring approval...`);

            for (let i = 0, len = pendingOrders.length; i < len; i++) {
                if (batchState === BatchState.CANCELLED) break;

                const pendingOrder = pendingOrders[i];
                EventBus.emit('batchStatusUpdate', `Approval ${i + 1}/${pendingOrders.length}: ${pendingOrder?.orderId}`);

                const pendingApprovals = (pendingOrder?.analysisResults || []).filter(r => r?.action === ActionType.PENDING_APPROVAL);
                if (pendingApprovals.length > 0) {
                    await handleApprovalFlow(pendingOrder, pendingApprovals);
                }

                addToBatchReport(pendingOrder);
                CacheManager.invalidate(pendingOrder?.orderId);

                if (i < len - 1) await sleep(CONFIG.BATCH.PAUSE_CHECK_INTERVAL);
            }
        };

        const saveProgress = (orderIds, chunkIndex) => {
            const processedOrders = AppState.get('processedOrders');
            const failedOrders = AppState.get('failedOrders');
            const batchReportData = AppState.get('batchReportData');

            ProgressManager.save({
                orderIds,
                chunkIndex,
                processedCount: processedOrders.size,
                failedCount: failedOrders.length,
                batchReportData,
                processedIds: Array.from(processedOrders.keys())
            });
        };

        const initializeBatch = (orderIds) => {
            const chunks = chunkArray(orderIds, CONFIG.BATCH.CHUNK_SIZE);

            AppState.resetBatch();
            AppState.update({
                currentOrderIds: orderIds,
                totalOrders: orderIds.length,
                isProcessing: true,
                isSingleMode: orderIds.length === 1,
                batchState: BatchState.RUNNING,
                batchStartTime: Date.now(),
                totalChunks: chunks.length,
                processedOrders: new Map(),
                failedOrders: []
            });

            batchState = BatchState.RUNNING;
            startTime = Date.now();

            Logger.info(`Batch initialized: ${orderIds.length} orders in ${chunks.length} chunks`);
            Telemetry.track(TelemetryEventType.BATCH_START, { orderCount: orderIds.length, chunkCount: chunks.length });
        };

        const finalizeBatch = () => {
            TokenManager.stopAutoRefresh();
            ProgressManager.clear();

            const processedOrders = AppState.get('processedOrders');
            const failedOrders = AppState.get('failedOrders');
            const elapsed = startTime ? Date.now() - startTime : 0;

            Logger.info(`Batch complete: ${processedOrders.size} success, ${failedOrders.length} failed in ${Helpers.formatElapsed(elapsed)}`);
            Telemetry.track(TelemetryEventType.BATCH_COMPLETE, { successCount: processedOrders.size, failedCount: failedOrders.length, duration: elapsed });

            AppState.update({ isProcessing: false, batchState: BatchState.COMPLETED });
            batchState = BatchState.COMPLETED;

            if (!AppState.get('isSingleMode')) {
                EventBus.emit('batchComplete', AppState.get('batchReportData'));
                EventBus.emit('showToast', Messages.SUCCESS.BATCH_COMPLETE(processedOrders.size, failedOrders.length), failedOrders.length > 0 ? 'warning' : 'success');
            }
        };

        const processEnhancedBatch = async (orderIds) => {
            const chunks = chunkArray(orderIds, CONFIG.BATCH.CHUNK_SIZE);
            EventBus.emit('showBatchProgress', orderIds.length, chunks.length);

            for (let chunkIndex = 0, len = chunks.length; chunkIndex < len; chunkIndex++) {
                if (batchState === BatchState.CANCELLED) break;

                while (batchState === BatchState.PAUSED) {
                    await sleep(CONFIG.BATCH.PAUSE_CHECK_INTERVAL);
                    if (batchState === BatchState.CANCELLED) break;
                }

                AppState.set('currentChunk', chunkIndex);
                const chunk = chunks[chunkIndex];

                // Ensure valid token
                if (TokenManager.getRemainingSeconds() < CONFIG.TOKEN.WARNING_THRESHOLD) {
                    EventBus.emit('batchStatusUpdate', Messages.INFO.TOKEN_REFRESHING);
                    const success = await TokenManager.ensure();
                    if (!success) throw ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_MISSING);
                }

                EventBus.emit('batchStatusUpdate', `Processing chunk ${chunkIndex + 1}/${chunks.length}...`);
                await processChunk(chunk);
                saveProgress(orderIds, chunkIndex);

                if (chunkIndex < len - 1 && batchState === BatchState.RUNNING) {
                    EventBus.emit('batchStatusUpdate', Messages.INFO.COOLING_DOWN);
                    await sleep(CONFIG.BATCH.CHUNK_DELAY);
                }
            }

            if (batchState !== BatchState.CANCELLED) {
                await processPendingApprovalOrders();
            }
        };

        const processSingleOrderDetailed = async (orderId) => {
            const steps = [
                { id: 'token', text: 'Checking authentication...', icon: '🔐' },
                { id: 'fetch', text: 'Fetching order data...', icon: '📥' },
                { id: 'fmc', text: 'Fetching FMC timestamps...', icon: '⏱️' },
                { id: 'analyze', text: 'Analyzing detention...', icon: '🔍' },
                { id: 'process', text: 'Processing actions...', icon: '⚡' },
                { id: 'complete', text: 'Complete!', icon: '✅' }
            ];

            EventBus.emit('showProgress', steps);
            const orderData = initializeOrderData(orderId);

            try {
                EventBus.emit('updateProgressStep', 'token', CSS_CLASSES.ACTIVE);
                await sleep(100);
                EventBus.emit('updateProgressStep', 'token', CSS_CLASSES.COMPLETED, 'Token ready');

                EventBus.emit('updateProgressStep', 'fetch', CSS_CLASSES.ACTIVE);
                const [viewData, smcExecResult] = await Promise.all([
                    HttpClient.request({ method: 'GET', url: `${CONFIG.URLS.SMC_BASE}/shipper/order/view/${encodeURIComponent(orderId)}`, headers: { 'Accept': 'application/json' } }, 'Order View', circuitBreakers.smc),
                    ErrorHandler.wrap(() => FMCApiService.fetchSMCExecution(orderId), ErrorType.NETWORK, null, false)
                ]);

                orderData.viewData = viewData;
                orderData.smcExecutionData = smcExecResult;
                orderData.shipperName = viewData?.shipperDetails?.shipperName || 'Unknown';

                const sowValidation = SOWConfigManager.validateShipper(orderData.shipperName);
                if (!sowValidation.valid) throw ErrorHandler.create(ErrorType.SOW, sowValidation.error);

                orderData.sowConfig = sowValidation.config;
                EventBus.emit('updateProgressStep', 'fetch', CSS_CLASSES.COMPLETED, smcExecResult ? `Tour: ${String(smcExecResult.tourId || '').substring(0, 15)}...` : 'Tour unavailable');

                EventBus.emit('updateProgressStep', 'fmc', CSS_CLASSES.ACTIVE);
                if (orderData.smcExecutionData?.tourId) {
                    try {
                        orderData.fmcData = await FMCApiService.fetchFMCByTourId(orderData.smcExecutionData.tourId);
                        const matchingVR = FMCApiService.findMatchingVR(orderData.fmcData?.records, orderData.smcExecutionData.contractedLane);
                        if (matchingVR) {
                            orderData.fmcTimestamps = FMCApiService.extractTimestamps(matchingVR);
                            if (orderData.fmcTimestamps) {
                                orderData.fmcTimestamps = FMCApiService.fillMissingTimestampsFromTour(orderData.fmcTimestamps, orderData.fmcData?.records, matchingVR.vehicleRunId);
                            }
                        }
                        EventBus.emit('updateProgressStep', 'fmc', CSS_CLASSES.COMPLETED, 'Timestamps loaded');
                    } catch (e) {
                        EventBus.emit('updateProgressStep', 'fmc', CSS_CLASSES.ERROR, 'FMC unavailable');
                    }
                } else {
                    EventBus.emit('updateProgressStep', 'fmc', CSS_CLASSES.ERROR, 'No Tour ID');
                }

                EventBus.emit('updateProgressStep', 'analyze', CSS_CLASSES.ACTIVE);
                analyzeStops(orderData);
                EventBus.emit('updateProgressStep', 'analyze', CSS_CLASSES.COMPLETED, `${orderData.analysisResults.length} stops`);

                const pendingApprovals = orderData.analysisResults.filter(r => r?.action === ActionType.PENDING_APPROVAL);
                if (pendingApprovals.length > 0) {
                    EventBus.emit('updateProgressStep', 'process', CSS_CLASSES.ACTIVE, 'Approval required...');
                    await handleApprovalFlow(orderData, pendingApprovals);
                    EventBus.emit('updateProgressStep', 'process', CSS_CLASSES.COMPLETED, 'Processed');
                } else {
                    const actionsNeeded = orderData.analysisResults.filter(r =>
                        r?.action === ActionType.ADD_CHARGE_UPDATE || r?.action === ActionType.ADD_CHARGE_CREATE || r?.action === ActionType.RELEASE_HOLD
                    );
                    const analysisOnlyActions = orderData.analysisResults.filter(r => r?.action === ActionType.ANALYSIS_ONLY);

                    if (actionsNeeded.length === 0) {
                        EventBus.emit('updateProgressStep', 'process', CSS_CLASSES.COMPLETED, analysisOnlyActions.length > 0 ? 'Analysis only' : 'No actions');
                    } else {
                        EventBus.emit('updateProgressStep', 'process', CSS_CLASSES.ACTIVE, `Processing ${actionsNeeded.length} action(s)...`);
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        await executeActions(orderData);
                        EventBus.emit('updateProgressStep', 'process', CSS_CLASSES.COMPLETED, `${actionsNeeded.length} action(s) done`);
                    }
                }

                EventBus.emit('updateProgressStep', 'complete', CSS_CLASSES.COMPLETED);
                CacheManager.invalidate(orderId);
                AppState.set('singleOrderData', orderData);
                EventBus.emit('displaySingleOrderResults', orderData);

            } catch (error) {
                Logger.error('Processing error', error.message);
                EventBus.emit('showProcessingError', error.message);
            }
        };

        const startFreshBatch = async (orderIds) => {
            initializeBatch(orderIds);

            const tokenOk = await TokenManager.ensure();
            if (!tokenOk) {
                EventBus.emit('showProcessingError', Messages.ERRORS.TOKEN_MISSING);
                AppState.set('isProcessing', false);
                return;
            }

            if (orderIds.length > 10) TokenManager.startAutoRefresh();

            if (orderIds.length === 1) {
                await processSingleOrderDetailed(orderIds[0]);
            } else {
                await processEnhancedBatch(orderIds);
            }

            finalizeBatch();
        };

        return {
            async processBatch(orderIds) {
                if (!SOWConfigManager.isLoaded()) {
                    EventBus.emit('showToast', Messages.ERRORS.SOW_SERVER_UNREACHABLE, 'error');
                    return;
                }

                if (orderIds.length > CONFIG.BATCH.MAX_ORDERS_PER_SESSION) {
                    EventBus.emit('showToast', Messages.ERRORS.BATCH_TOO_LARGE(CONFIG.BATCH.MAX_ORDERS_PER_SESSION), 'error');
                    return;
                }

                const savedProgress = ProgressManager.load();
                if (savedProgress && savedProgress.orderIds?.length === orderIds.length &&
                    savedProgress.orderIds.every((id, i) => id === orderIds[i])) {
                    const resume = await new Promise(resolve => {
                        const overlay = document.createElement('div');
                        overlay.id = 'd-dart-resume-overlay';
                        overlay.innerHTML = `
                            <div class="d-dart-resume-popup">
                                <div class="d-dart-resume-title">📋 Resume Previous Batch?</div>
                                <div class="d-dart-resume-info">
                                    Found saved progress:<br>
                                    <strong>${savedProgress.processedCount}</strong> processed<br>
                                    <strong>${savedProgress.failedCount}</strong> failed<br>
                                    <strong>${savedProgress.orderIds.length - savedProgress.processedCount - savedProgress.failedCount}</strong> remaining
                                </div>
                                <div class="d-dart-resume-buttons">
                                    <button class="d-dart-resume-btn yes" id="d-dart-resume-yes">✅ Resume</button>
                                    <button class="d-dart-resume-btn no" id="d-dart-resume-no">🔄 Start Fresh</button>
                                </div>
                            </div>
                        `;
                        document.body.appendChild(overlay);

                        document.getElementById('d-dart-resume-yes').onclick = () => { overlay.remove(); resolve(true); };
                        document.getElementById('d-dart-resume-no').onclick = () => { overlay.remove(); ProgressManager.clear(); resolve(false); };
                    });

                    if (resume) {
                        AppState.set('batchReportData', savedProgress.batchReportData || []);
                        const processedIds = new Set(savedProgress.processedIds || []);
                        const remainingOrders = orderIds.filter(id => !processedIds.has(id));
                        if (remainingOrders.length === 0) {
                            EventBus.emit('batchComplete', savedProgress.batchReportData);
                            return;
                        }
                        await startFreshBatch(remainingOrders);
                        return;
                    }
                }

                await startFreshBatch(orderIds);
            },

            pause() {
                if (batchState === BatchState.RUNNING) {
                    batchState = BatchState.PAUSED;
                    AppState.set('batchState', BatchState.PAUSED);
                    Logger.info('Batch paused');
                    EventBus.emit('batchStatusUpdate', Messages.INFO.BATCH_PAUSED);
                }
            },

            resume() {
                if (batchState === BatchState.PAUSED) {
                    batchState = BatchState.RUNNING;
                    AppState.set('batchState', BatchState.RUNNING);
                    Logger.info('Batch resumed');
                }
            },

            cancel() {
                batchState = BatchState.CANCELLED;
                AppState.set('batchState', BatchState.CANCELLED);
                Logger.info('Batch cancelled');
            },

            getState: () => batchState
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 33: STYLES
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Styles = `
        #d-dart, #d-dart * { box-sizing: border-box !important; font-family: 'Amazon Ember', 'Segoe UI', Tahoma, sans-serif !important; }
        #d-dart { position: fixed !important; top: ${CONFIG.INITIAL_POSITION.top} !important; left: ${CONFIG.INITIAL_POSITION.left} !important; width: ${CONFIG.UI.PANEL_WIDTH}px !important; background: #232F3E !important; border: 2px solid #FF9900 !important; border-radius: 12px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important; z-index: 2147483647 !important; color: #FFF !important; overflow: hidden !important; transition: all 0.3s ease !important; }
        #d-dart.dragging { opacity: 0.9 !important; box-shadow: 0 12px 40px rgba(0,0,0,0.6) !important; cursor: grabbing !important; }
        #d-dart.minimized { width: ${CONFIG.UI.PANEL_MIN_WIDTH}px !important; height: ${CONFIG.UI.PANEL_MIN_WIDTH}px !important; border-radius: 50% !important; cursor: grab !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; }
        #d-dart.minimized:hover { box-shadow: 0 0 20px rgba(255,153,0,0.6) !important; transform: scale(1.05) !important; }
        #d-dart.minimized #d-dart-header, #d-dart.minimized #d-dart-body { display: none !important; }
        #d-dart.minimized #d-dart-minimized-icon { display: flex !important; }
        #d-dart-minimized-icon { display: none !important; font-size: 26px !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; cursor: pointer !important; }
        #d-dart.minimized.healthy { box-shadow: 0 0 20px rgba(0,255,136,0.5) !important; }
        #d-dart.minimized.unhealthy { box-shadow: 0 0 20px rgba(255,107,107,0.5) !important; }

        #d-dart-header { background: linear-gradient(90deg, #FF9900 0%, #E88B00 100%) !important; padding: 10px 12px !important; cursor: grab !important; display: flex !important; justify-content: space-between !important; align-items: center !important; user-select: none !important; }
        #d-dart-header:active { cursor: grabbing !important; }
        #d-dart-header h3 { margin: 0 !important; font-size: 13px !important; font-weight: 700 !important; color: #232F3E !important; display: flex !important; align-items: center !important; gap: 6px !important; flex-wrap: wrap !important; }
        .d-dart-version-badge { font-size: 9px !important; background: rgba(0,0,0,0.2) !important; padding: 2px 6px !important; border-radius: 8px !important; }
        .d-dart-status-indicators { display: flex !important; gap: 4px !important; align-items: center !important; }
        .d-dart-token-indicator, .d-dart-sow-indicator { font-size: 9px !important; padding: 2px 6px !important; border-radius: 8px !important; font-weight: 700 !important; display: inline-flex !important; align-items: center !important; gap: 3px !important; cursor: pointer !important; }
        .d-dart-token-indicator.ready, .d-dart-sow-indicator.loaded { background: rgba(0,128,0,0.3) !important; color: #004d00 !important; }
        .d-dart-token-indicator.warning { background: rgba(255,200,0,0.4) !important; color: #6b5900 !important; }
        .d-dart-token-indicator.critical { background: rgba(255,100,100,0.4) !important; color: #8b0000 !important; animation: d-dart-pulse 0.5s infinite !important; }
        .d-dart-token-indicator.fetching, .d-dart-sow-indicator.loading { background: rgba(0,0,255,0.2) !important; color: #00008b !important; }
        .d-dart-token-indicator.error, .d-dart-sow-indicator.error { background: rgba(255,0,0,0.25) !important; color: #8b0000 !important; }
        .d-dart-header-right { display: flex !important; align-items: center !important; gap: 10px !important; }
        .d-dart-signature { font-size: 14px !important; color: #232F3E !important; font-weight: 800 !important; }
        .d-dart-header-buttons { display: flex !important; gap: 8px !important; }
        .d-dart-header-btn { background: transparent !important; border: none !important; color: #232F3E !important; font-size: 16px !important; cursor: pointer !important; padding: 2px 5px !important; transition: transform 0.2s ease !important; font-weight: bold !important; line-height: 1 !important; }
        .d-dart-header-btn:hover { transform: scale(1.2) !important; }
        .d-dart-header-btn:focus { outline: 2px solid #232F3E !important; outline-offset: 2px !important; }

        #d-dart-body { padding: 12px !important; max-height: 75vh !important; overflow-y: auto !important; background: #1a242f !important; }
        .d-dart-input-group { display: flex !important; gap: 8px !important; margin-bottom: 12px !important; }
        .d-dart-input { flex: 1 !important; padding: 10px 12px !important; border: 2px solid #37475A !important; border-radius: 6px !important; background: #232F3E !important; color: #FFF !important; font-size: 13px !important; outline: none !important; transition: border-color 0.2s ease !important; }
        .d-dart-input:focus { border-color: #FF9900 !important; }
        .d-dart-input.error { border-color: #ff6b6b !important; animation: d-dart-shake 0.3s !important; }
        .d-dart-input::placeholder { color: #666 !important; font-size: 11px !important; }
        .d-dart-input:disabled { opacity: 0.6 !important; cursor: not-allowed !important; }

        @keyframes d-dart-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        @keyframes d-dart-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes d-dart-spin { to { transform: rotate(360deg); } }

        .d-dart-btn { padding: 10px 20px !important; background: #FF9900 !important; border: none !important; border-radius: 6px !important; color: #232F3E !important; font-weight: 700 !important; font-size: 13px !important; cursor: pointer !important; transition: all 0.2s ease !important; min-width: 90px !important; position: relative !important; }
        .d-dart-btn:hover:not(:disabled) { background: #FEBD69 !important; transform: translateY(-1px) !important; box-shadow: 0 4px 12px rgba(255,153,0,0.4) !important; }
        .d-dart-btn:focus { outline: 2px solid #FFF !important; outline-offset: 2px !important; }
        .d-dart-btn:disabled { background: #555 !important; cursor: not-allowed !important; }
        .d-dart-btn.loading { color: transparent !important; }
        .d-dart-btn.loading::after { content: ''; position: absolute; width: 16px; height: 16px; top: 50%; left: 50%; margin: -8px 0 0 -8px; border: 2px solid #232F3E; border-top-color: transparent; border-radius: 50%; animation: d-dart-spin 0.8s linear infinite; }

        .d-dart-toast { position: fixed !important; bottom: 25px !important; left: 50% !important; transform: translateX(-50%) translateY(20px) !important; background: #FF9900 !important; color: #232F3E !important; padding: 10px 20px !important; border-radius: 8px !important; font-size: 13px !important; font-weight: 600 !important; z-index: 2147483648 !important; opacity: 0 !important; transition: all 0.3s ease !important; pointer-events: none !important; max-width: 400px !important; text-align: center !important; }
        .d-dart-toast.show { opacity: 1 !important; transform: translateX(-50%) translateY(0) !important; }
        .d-dart-toast.error { background: #ff6b6b !important; color: #FFF !important; }
        .d-dart-toast.success { background: #00ff88 !important; color: #232F3E !important; }
        .d-dart-toast.warning { background: #ffd700 !important; color: #232F3E !important; }

        .d-dart-visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }

        .d-dart-settings-panel { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: ${CONFIG.UI.SETTINGS_PANEL_WIDTH}px !important; max-width: 95vw !important; max-height: 85vh !important; background: #232F3E !important; border: 2px solid #FF9900 !important; border-radius: 12px !important; box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important; z-index: 2147483648 !important; display: flex !important; flex-direction: column !important; animation: d-dart-slideIn 0.3s ease !important; }
        @keyframes d-dart-slideIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        .d-dart-settings-overlay { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.6) !important; z-index: 2147483647 !important; }
        .d-dart-settings-header { background: linear-gradient(90deg, #FF9900, #E88B00) !important; padding: 12px 16px !important; display: flex !important; justify-content: space-between !important; align-items: center !important; border-radius: 10px 10px 0 0 !important; flex-shrink: 0 !important; }
        .d-dart-settings-title { font-size: 16px !important; font-weight: 700 !important; color: #232F3E !important; }
        .d-dart-settings-close { background: rgba(0,0,0,0.2) !important; border: none !important; color: #232F3E !important; font-size: 18px !important; width: 28px !important; height: 28px !important; border-radius: 50% !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; transition: all 0.2s ease !important; }
        .d-dart-settings-close:hover { background: rgba(0,0,0,0.4) !important; transform: scale(1.1) !important; }
        .d-dart-settings-body { padding: 16px !important; overflow-y: auto !important; flex: 1 !important; }
        .d-dart-settings-section { background: #37475A !important; border-radius: 8px !important; padding: 12px !important; margin-bottom: 12px !important; }
        .d-dart-settings-section-title { font-size: 12px !important; font-weight: 700 !important; color: #FF9900 !important; text-transform: uppercase !important; margin-bottom: 10px !important; letter-spacing: 0.5px !important; }
        .d-dart-stats-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; margin-bottom: 10px !important; }
        .d-dart-stat-box { background: #1a242f !important; border-radius: 6px !important; padding: 10px 8px !important; text-align: center !important; }
        .d-dart-stat-box .d-dart-stat-value { display: block !important; font-size: 20px !important; font-weight: 700 !important; color: #FFF !important; }
        .d-dart-stat-box .d-dart-stat-label { font-size: 9px !important; color: #888 !important; text-transform: uppercase !important; }
        .d-dart-stat-box.active .d-dart-stat-value { color: #00ff88 !important; }
        .d-dart-stat-box.inactive .d-dart-stat-value { color: #888 !important; }
        .d-dart-stat-box.error .d-dart-stat-value { color: #ff6b6b !important; }
        .d-dart-last-refresh { font-size: 11px !important; color: #888 !important; text-align: center !important; }
        .d-dart-settings-actions { display: flex !important; gap: 8px !important; margin-bottom: 12px !important; }
        .d-dart-action-btn { flex: 1 !important; padding: 8px 12px !important; background: #37475A !important; border: 1px solid #485769 !important; border-radius: 6px !important; color: #FFF !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important; transition: all 0.2s ease !important; }
        .d-dart-action-btn:hover { background: #485769 !important; border-color: #FF9900 !important; }
        .d-dart-search-box { position: relative !important; margin-bottom: 10px !important; }
        .d-dart-search-input { width: 100% !important; padding: 10px 12px 10px 36px !important; background: #1a242f !important; border: 2px solid #485769 !important; border-radius: 6px !important; color: #FFF !important; font-size: 13px !important; outline: none !important; transition: border-color 0.2s ease !important; }
        .d-dart-search-input:focus { border-color: #FF9900 !important; }
        .d-dart-search-input::placeholder { color: #666 !important; }
        .d-dart-search-icon { position: absolute !important; left: 12px !important; top: 50% !important; transform: translateY(-50%) !important; font-size: 14px !important; opacity: 0.6 !important; }
        .d-dart-filters-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; margin-bottom: 10px !important; }
        .d-dart-filter-group { display: flex !important; flex-direction: column !important; gap: 4px !important; }
        .d-dart-filter-label { font-size: 10px !important; color: #888 !important; text-transform: uppercase !important; }
        .d-dart-filter-select { padding: 6px 8px !important; background: #1a242f !important; border: 1px solid #485769 !important; border-radius: 4px !important; color: #FFF !important; font-size: 11px !important; cursor: pointer !important; outline: none !important; }
        .d-dart-filter-select:focus { border-color: #FF9900 !important; }
        .d-dart-checkbox-label { display: flex !important; align-items: center !important; gap: 8px !important; font-size: 12px !important; color: #CCC !important; cursor: pointer !important; }
        .d-dart-shippers-list { max-height: 350px !important; overflow-y: auto !important; }
        .d-dart-no-results { text-align: center !important; padding: 30px !important; color: #888 !important; font-size: 13px !important; }
        .d-dart-shipper-card-settings { background: #1a242f !important; border-radius: 6px !important; margin-bottom: 8px !important; border-left: 3px solid #37475A !important; overflow: hidden !important; }
        .d-dart-shipper-card-settings.status-active { border-left-color: #00ff88 !important; }
        .d-dart-shipper-card-settings.status-inactive { border-left-color: #888 !important; }
        .d-dart-shipper-card-settings.status-error { border-left-color: #ff6b6b !important; }
        .d-dart-shipper-header-settings { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 10px 12px !important; cursor: pointer !important; transition: background 0.2s ease !important; }
        .d-dart-shipper-header-settings:hover { background: rgba(255,153,0,0.1) !important; }
        .d-dart-shipper-info { display: flex !important; align-items: center !important; gap: 8px !important; }
        .d-dart-shipper-status-icon { font-size: 14px !important; }
        .d-dart-shipper-name-settings { font-size: 13px !important; font-weight: 600 !important; color: #FFF !important; }
        .d-dart-shipper-summary { display: flex !important; align-items: center !important; gap: 10px !important; }
        .d-dart-shipper-rate, .d-dart-shipper-max { font-size: 11px !important; color: #888 !important; }
        .d-dart-validation-error-badge { font-size: 10px !important; color: #ff6b6b !important; background: rgba(255,107,107,0.15) !important; padding: 2px 8px !important; border-radius: 4px !important; }
        .d-dart-expand-btn { background: transparent !important; border: none !important; color: #888 !important; font-size: 12px !important; cursor: pointer !important; padding: 4px 8px !important; transition: color 0.2s ease !important; }
        .d-dart-expand-btn:hover { color: #FF9900 !important; }
        .d-dart-shipper-details { max-height: 0 !important; overflow: hidden !important; transition: max-height 0.3s ease, padding 0.3s ease !important; background: #232F3E !important; }
        .d-dart-shipper-details.expanded { max-height: 400px !important; padding: 12px !important; border-top: 1px solid #37475A !important; }
        .d-dart-validation-errors { background: rgba(255,107,107,0.1) !important; border: 1px solid #ff6b6b !important; border-radius: 6px !important; padding: 10px !important; margin-bottom: 12px !important; }
        .d-dart-error-title { font-size: 12px !important; font-weight: 600 !important; color: #ff6b6b !important; margin-bottom: 6px !important; }
        .d-dart-error-list { margin: 0 !important; padding-left: 20px !important; font-size: 11px !important; color: #ff9999 !important; }
        .d-dart-error-list li { margin-bottom: 4px !important; }
        .d-dart-details-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        .d-dart-details-section { background: #37475A !important; border-radius: 6px !important; padding: 10px !important; }
        .d-dart-details-title { font-size: 10px !important; font-weight: 700 !important; color: #FF9900 !important; text-transform: uppercase !important; margin-bottom: 8px !important; padding-bottom: 4px !important; border-bottom: 1px solid #485769 !important; }
        .d-dart-details-row { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 4px 0 !important; font-size: 11px !important; }
        .d-dart-details-label { color: #888 !important; }
        .d-dart-details-value { color: #FFF !important; font-weight: 500 !important; }
        .d-dart-details-value.yes { color: #00ff88 !important; }
        .d-dart-details-value.no { color: #ff6b6b !important; }

        .d-dart-detention-banner { background: #232F3E !important; border: 1px solid #FF9900 !important; border-radius: 8px !important; margin-bottom: 10px !important; overflow: hidden !important; }
        .d-dart-banner-header { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 10px 12px !important; background: linear-gradient(90deg, rgba(255,153,0,0.2), rgba(255,153,0,0.05)) !important; border-bottom: 1px solid #37475A !important; }
        .d-dart-banner-title { font-size: 12px !important; font-weight: 700 !important; color: #FF9900 !important; text-transform: uppercase !important; }
        .d-dart-banner-toggle { background: transparent !important; border: 1px solid #FF9900 !important; border-radius: 4px !important; color: #FF9900 !important; font-size: 11px !important; padding: 4px 10px !important; cursor: pointer !important; transition: all 0.2s ease !important; font-weight: 600 !important; }
        .d-dart-banner-toggle:hover { background: #FF9900 !important; color: #232F3E !important; }
        .d-dart-banner-summary { padding: 12px !important; }
        .d-dart-banner-row { display: flex !important; align-items: center !important; padding: 8px 12px !important; background: #37475A !important; border-radius: 6px !important; margin-bottom: 6px !important; }
        .d-dart-banner-row:last-child { margin-bottom: 0 !important; }
        .d-dart-banner-label { font-size: 12px !important; font-weight: 700 !important; color: #888 !important; width: 90px !important; flex-shrink: 0 !important; }
        .d-dart-banner-value { font-size: 13px !important; font-weight: 700 !important; flex: 1 !important; }
        .d-dart-banner-value.charge-added { color: #00ff88 !important; }
        .d-dart-banner-value.hold-released { color: #4dabf7 !important; }
        .d-dart-banner-value.chargeable { color: #ffd700 !important; }
        .d-dart-banner-value.charge-exists { color: #ffd700 !important; }
        .d-dart-banner-value.pending { color: #888 !important; }
        .d-dart-banner-value.no-charge { color: #ff6b6b !important; }
        .d-dart-banner-value.no-action { color: #888 !important; }
        .d-dart-banner-value.analysis-only { color: #4dabf7 !important; }
        .d-dart-banner-details { max-height: 0 !important; overflow: hidden !important; transition: max-height 0.3s ease, padding 0.3s ease !important; background: #1a242f !important; }
        .d-dart-banner-details.expanded { max-height: 400px !important; padding: 12px !important; border-top: 1px solid #37475A !important; }
        .d-dart-breakdown-section { background: #232F3E !important; border-radius: 6px !important; padding: 10px 12px !important; margin-bottom: 8px !important; border: 1px solid #37475A !important; }
        .d-dart-breakdown-section:last-child { margin-bottom: 0 !important; }
        .d-dart-breakdown-title { font-size: 11px !important; font-weight: 700 !important; color: #FF9900 !important; margin-bottom: 8px !important; text-transform: uppercase !important; }
        .d-dart-breakdown-content { font-size: 11px !important; color: #ccc !important; line-height: 1.6 !important; }
        .d-dart-breakdown-line { padding: 2px 0 !important; }

        .d-dart-shipper-card { background: #37475A !important; border-radius: 8px !important; padding: 10px !important; margin-bottom: 10px !important; border: 1px solid #485769 !important; }
        .d-dart-header-row { display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 8px !important; padding-bottom: 8px !important; border-bottom: 1px solid #485769 !important; }
        .d-dart-shipper-name { font-size: 14px !important; font-weight: 700 !important; color: #FF9900 !important; }
        .d-dart-header-badges { display: flex !important; align-items: center !important; gap: 8px !important; }
        .d-dart-status-badge { padding: 4px 10px !important; border-radius: 4px !important; font-size: 10px !important; font-weight: 600 !important; color: #FFF !important; text-transform: uppercase !important; }
        .d-dart-sow-badge { font-size: 12px !important; font-weight: 700 !important; cursor: pointer !important; padding: 2px 6px !important; border-radius: 4px !important; color: #FF9900 !important; }
        .d-dart-sow-badge.error { color: #ff6b6b !important; }
        .d-dart-sow-badge:hover { color: #FFD700 !important; }
        .d-dart-sow-details { max-height: 0 !important; overflow: hidden !important; background: #1a242f !important; border-radius: 4px !important; transition: all 0.3s ease !important; margin-bottom: 0 !important; }
        .d-dart-sow-details.expanded { max-height: 150px !important; margin-bottom: 8px !important; padding: 8px 10px !important; border: 1px solid #FF9900 !important; }
        .d-dart-sow-flex { display: flex !important; flex-wrap: wrap !important; gap: 8px 16px !important; align-items: center !important; }
        .d-dart-sow-item { display: flex !important; align-items: center !important; gap: 4px !important; font-size: 10px !important; white-space: nowrap !important; }
        .d-dart-sow-item-label { color: #888 !important; }
        .d-dart-sow-item-value { color: #FF9900 !important; font-weight: 600 !important; }
        .d-dart-sow-item-value.warning { color: #ffd700 !important; }
        .d-dart-sow-item-value.success { color: #00ff88 !important; }
        .d-dart-sow-item-value.disabled { color: #ff6b6b !important; }
        .d-dart-id-row { display: flex !important; margin-bottom: 8px !important; border-bottom: 1px solid #485769 !important; padding-bottom: 8px !important; }
        .d-dart-id-item { flex: 1 !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 6px 4px !important; color: #FEBD69 !important; text-decoration: none !important; border-right: 1px solid #485769 !important; transition: all 0.2s ease !important; cursor: pointer !important; }
        .d-dart-id-item:last-child { border-right: none !important; }
        .d-dart-id-item:hover { background: rgba(255,153,0,0.1) !important; }
        .d-dart-id-item:hover .d-dart-id-value { color: #FF9900 !important; text-decoration: underline !important; }
        .d-dart-id-content { display: flex !important; flex-direction: column !important; align-items: center !important; gap: 2px !important; min-width: 0 !important; }
        .d-dart-id-label { font-size: 9px !important; font-weight: 600 !important; color: #888 !important; text-transform: uppercase !important; }
        .d-dart-id-value { display: flex !important; align-items: center !important; gap: 4px !important; font-size: 14px !important; font-weight: 700 !important; color: #FEBD69 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        .d-dart-lane-row { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 8px 10px !important; background: #1a242f !important; border-radius: 6px !important; margin-bottom: 8px !important; gap: 8px !important; }
        .d-dart-lane-origin, .d-dart-lane-dest { font-size: 11px !important; font-weight: 600 !important; color: #FFF !important; }
        .d-dart-lane-arrow-container { flex: 1 !important; display: flex !important; justify-content: center !important; align-items: center !important; }
        .d-dart-arrow-static { color: #FF9900 !important; font-size: 12px !important; letter-spacing: -1px !important; }
        .d-dart-holds-row { display: flex !important; align-items: center !important; padding: 8px 10px !important; background: #1a242f !important; border-radius: 6px !important; }
        .d-dart-holds-label { flex: 0 0 20% !important; font-size: 11px !important; font-weight: 700 !important; color: #888 !important; text-transform: uppercase !important; }
        .d-dart-hold-item { flex: 0 0 40% !important; font-size: 12px !important; font-weight: 700 !important; text-align: center !important; }
        .d-dart-hold-item.has-hold { color: #00ff88 !important; }
        .d-dart-hold-item.no-hold { color: #ff6b6b !important; }

        .d-dart-section-title { font-size: 11px !important; font-weight: 600 !important; color: #FF9900 !important; text-transform: uppercase !important; letter-spacing: 1px !important; margin-bottom: 8px !important; padding-bottom: 4px !important; border-bottom: 1px solid #37475A !important; }
        .d-dart-stop-card { background: #37475A !important; border-radius: 8px !important; padding: 10px !important; margin-bottom: 6px !important; border-left: 3px solid #FF9900 !important; }
        .d-dart-stop-card:last-child { margin-bottom: 0 !important; }
        .d-dart-stop-header { display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 10px !important; padding-bottom: 8px !important; border-bottom: 1px solid #485769 !important; }
        .d-dart-stop-title { font-size: 10px !important; font-weight: 700 !important; color: #FFF !important; }
        .d-dart-stop-badges { display: flex !important; gap: 6px !important; }
        .d-dart-stop-badge { font-size: 10px !important; padding: 3px 8px !important; border-radius: 4px !important; font-weight: 600 !important; text-transform: uppercase !important; }
        .d-dart-stop-badge.pickup { background: rgba(255,153,0,0.25) !important; color: #FF9900 !important; }
        .d-dart-stop-badge.dropoff { background: rgba(0,255,136,0.2) !important; color: #00ff88 !important; }
        .d-dart-stop-badge.load-type { background: #485769 !important; color: #FFF !important; }
        .d-dart-timestamp-boxes { display: flex !important; flex-direction: column !important; gap: 6px !important; }
        .d-dart-ts-box { display: flex !important; width: 100% !important; background: #1a242f !important; border-radius: 6px !important; overflow: hidden !important; border: 1px solid #485769 !important; }
        .d-dart-ts-col { padding: 8px 10px !important; display: flex !important; flex-direction: column !important; gap: 4px !important; border-right: 1px solid #485769 !important; }
        .d-dart-ts-col:last-child { border-right: none !important; }
        .d-dart-ts-col.planned { width: 35% !important; }
        .d-dart-ts-col.actual { width: 35% !important; }
        .d-dart-ts-col.delay { width: 30% !important; text-align: center !important; justify-content: center !important; align-items: center !important; }
        .d-dart-ts-col.delay.early { background: rgba(0,255,136,0.15) !important; }
        .d-dart-ts-col.delay.late { background: rgba(255,107,107,0.15) !important; }
        .d-dart-ts-col-label { font-size: 10px !important; font-weight: 600 !important; color: #888 !important; text-transform: uppercase !important; }
        .d-dart-ts-col-value { font-size: 13px !important; font-weight: 700 !important; color: #FFF !important; }
        .d-dart-ts-col.delay.early .d-dart-ts-col-value { color: #00ff88 !important; }
        .d-dart-ts-col.delay.late .d-dart-ts-col-value { color: #ff6b6b !important; }
        .d-dart-borrowed-indicator { font-size: 9px !important; color: #ffd43b !important; background: rgba(255,212,59,0.15) !important; padding: 2px 6px !important; border-radius: 3px !important; margin-top: 4px !important; }

        .d-dart-progress { background: #232F3E !important; border-radius: 8px !important; padding: 15px !important; margin-bottom: 12px !important; }
        .d-dart-progress-title { font-size: 18px !important; font-weight: 700 !important; color: #FF9900 !important; margin-bottom: 12px !important; text-align: center !important; }
        .d-dart-progress-steps { display: flex !important; flex-direction: column !important; gap: 6px !important; }
        .d-dart-step { display: flex !important; align-items: center !important; gap: 10px !important; padding: 8px 12px !important; background: #37475A !important; border-radius: 6px !important; font-size: 13px !important; transition: all 0.3s ease !important; }
        .d-dart-step.pending { opacity: 0.5 !important; }
        .d-dart-step.active { background: #485769 !important; border-left: 3px solid #FF9900 !important; animation: d-dart-pulse 1s infinite !important; }
        .d-dart-step.completed { background: rgba(0,255,136,0.1) !important; border-left: 3px solid #00ff88 !important; }
        .d-dart-step.error { background: rgba(255,107,107,0.1) !important; border-left: 3px solid #ff6b6b !important; }
        .d-dart-step-icon { font-size: 16px !important; width: 24px !important; text-align: center !important; }
        .d-dart-step-text { flex: 1 !important; font-weight: 500 !important; }
        .d-dart-step-status { font-size: 10px !important; color: #888 !important; }

        .d-dart-enhanced-progress { background: #232F3E !important; border-radius: 8px !important; padding: 15px !important; }
        .d-dart-progress-header { display: flex !important; justify-content: space-between !important; align-items: center !important; margin-bottom: 15px !important; }
        .d-dart-progress-controls { display: flex !important; gap: 6px !important; }
        .d-dart-control-btn { background: #37475A !important; border: 1px solid #485769 !important; border-radius: 6px !important; padding: 6px 10px !important; font-size: 14px !important; cursor: pointer !important; transition: all 0.2s !important; color: #FFF !important; }
        .d-dart-control-btn:hover { background: #485769 !important; border-color: #FF9900 !important; }
        .d-dart-control-btn.cancel:hover { background: rgba(255,107,107,0.2) !important; border-color: #ff6b6b !important; }
        .d-dart-progress-stats { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; margin-bottom: 15px !important; }
        .d-dart-stat { background: #37475A !important; border-radius: 6px !important; padding: 10px 8px !important; text-align: center !important; }
        .d-dart-stat.success .d-dart-stat-value { color: #00ff88 !important; }
        .d-dart-stat.error .d-dart-stat-value { color: #ff6b6b !important; }
        .d-dart-stat-value { display: block !important; font-size: 22px !important; font-weight: 700 !important; color: #FF9900 !important; }
        .d-dart-stat-label { font-size: 9px !important; color: #888 !important; text-transform: uppercase !important; }
        .d-dart-progress-bar-container { height: 8px !important; background: #37475A !important; border-radius: 4px !important; overflow: hidden !important; margin-bottom: 10px !important; }
        .d-dart-progress-bar { height: 100% !important; background: linear-gradient(90deg, #FF9900, #00ff88) !important; border-radius: 4px !important; transition: width 0.3s ease !important; }
        .d-dart-progress-info { text-align: center !important; margin-bottom: 10px !important; }
        .d-dart-progress-status { color: #FFF !important; font-size: 12px !important; margin-bottom: 4px !important; }
        .d-dart-progress-eta { color: #888 !important; font-size: 11px !important; }
        .d-dart-progress-footer { display: flex !important; justify-content: space-between !important; font-size: 10px !important; color: #666 !important; }
        .d-dart-progress-token .token-ok { color: #00ff88 !important; }
        .d-dart-progress-token .token-warning { color: #ffd700 !important; }
        .d-dart-progress-token .token-error { color: #ff6b6b !important; }

        .d-dart-batch-summary { display: grid !important; grid-template-columns: repeat(6, 1fr) !important; gap: 6px !important; margin-bottom: 10px !important; }
        .d-dart-batch-stat { background: #37475A !important; border-radius: 6px !important; padding: 8px 4px !important; text-align: center !important; font-size: 10px !important; font-weight: 600 !important; }
        .d-dart-batch-stat.success { color: #00ff88 !important; }
        .d-dart-batch-stat.recovered { color: #FF9900 !important; }
        .d-dart-batch-stat.released { color: #4dabf7 !important; }
        .d-dart-batch-stat.analysis { color: #4dabf7 !important; }
        .d-dart-batch-stat.pending { color: #ffd700 !important; }
        .d-dart-batch-stat.error { color: #ff6b6b !important; }
        .d-dart-batch-table-container { max-height: 300px !important; overflow-y: auto !important; margin-bottom: 10px !important; border-radius: 6px !important; border: 1px solid #37475A !important; }
        .d-dart-batch-table { width: 100% !important; border-collapse: collapse !important; font-size: 10px !important; }
        .d-dart-batch-table th { background: #37475A !important; color: #888 !important; padding: 6px 4px !important; text-align: left !important; font-weight: 600 !important; text-transform: uppercase !important; position: sticky !important; top: 0 !important; font-size: 9px !important; }
        .d-dart-batch-table td { padding: 5px 4px !important; border-bottom: 1px solid #37475A !important; color: #FFF !important; }
        .d-dart-batch-table tr.success td { background: rgba(0,255,136,0.05) !important; }
        .d-dart-batch-table tr.pending td { background: rgba(255,215,0,0.05) !important; }
        .d-dart-batch-table tr.error td { background: rgba(255,107,107,0.05) !important; }
        .d-dart-batch-table tr.recovered td { background: rgba(255,153,0,0.05) !important; }
        .d-dart-batch-table tr.analysis td { background: rgba(77,171,247,0.05) !important; }
        .d-dart-order-cell { color: #FEBD69 !important; }
        .d-dart-download-buttons { display: flex !important; gap: 8px !important; justify-content: center !important; }
        .d-dart-download-btn { padding: 8px 16px !important; background: #37475A !important; border: 1px solid #485769 !important; border-radius: 6px !important; color: #FFF !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important; transition: all 0.2s ease !important; }
        .d-dart-download-btn:hover { background: #485769 !important; border-color: #FF9900 !important; }

        .d-dart-error { background: rgba(255,107,107,0.15) !important; border: 1px solid #ff6b6b !important; border-radius: 8px !important; padding: 20px !important; color: #ff6b6b !important; text-align: center !important; }
        .d-dart-error-icon { font-size: 32px !important; margin-bottom: 8px !important; }
        .d-dart-error-title { font-size: 16px !important; font-weight: 700 !important; margin-bottom: 8px !important; }
        .d-dart-error-message { font-size: 12px !important; line-height: 1.4 !important; }
        .d-dart-empty { text-align: center !important; padding: 20px !important; color: #888 !important; font-size: 13px !important; }

        .d-dart-sow-error { background: rgba(255,107,107,0.1) !important; border: 1px solid #ff6b6b !important; border-radius: 8px !important; padding: 20px !important; text-align: center !important; margin-bottom: 12px !important; }
        .d-dart-sow-error-icon { font-size: 40px !important; margin-bottom: 10px !important; }
        .d-dart-sow-error-title { font-size: 16px !important; font-weight: 700 !important; color: #ff6b6b !important; margin-bottom: 8px !important; }
        .d-dart-sow-error-message { font-size: 12px !important; color: #ccc !important; margin-bottom: 15px !important; }
        .d-dart-sow-error-instructions { font-size: 11px !important; color: #888 !important; text-align: left !important; margin-bottom: 15px !important; padding: 10px !important; background: #232F3E !important; border-radius: 6px !important; }
        .d-dart-sow-error-instructions p { margin: 5px 0 !important; }
        .d-dart-sow-login-btn { display: inline-block !important; padding: 10px 20px !important; background: #37475A !important; color: #FFF !important; text-decoration: none !important; border-radius: 6px !important; font-weight: 600 !important; margin-bottom: 10px !important; transition: all 0.2s ease !important; }
        .d-dart-sow-login-btn:hover { background: #485769 !important; }
        .d-dart-sow-retry-btn { display: block !important; width: 100% !important; padding: 10px !important; background: #FF9900 !important; border: none !important; border-radius: 6px !important; color: #232F3E !important; font-weight: 700 !important; cursor: pointer !important; transition: all 0.2s ease !important; }
        .d-dart-sow-retry-btn:hover { background: #FEBD69 !important; }

        #d-dart-approval-overlay { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.7) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 2147483650 !important; }
        .d-dart-approval-popup { background: #232F3E !important; border: 2px solid #FF9900 !important; border-radius: 12px !important; width: 420px !important; max-width: 90vw !important; box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important; }
        .d-dart-approval-header { background: linear-gradient(90deg, #FF9900, #E88B00) !important; padding: 12px 16px !important; border-radius: 10px 10px 0 0 !important; display: flex !important; justify-content: space-between !important; align-items: center !important; }
        .d-dart-approval-title { font-size: 16px !important; font-weight: 700 !important; color: #232F3E !important; }
        .d-dart-approval-timer { font-size: 14px !important; font-weight: 700 !important; color: #232F3E !important; background: rgba(255,255,255,0.3) !important; padding: 4px 10px !important; border-radius: 20px !important; }
        .d-dart-approval-timer.warning { background: rgba(255,200,0,0.5) !important; color: #000 !important; }
        .d-dart-approval-timer.critical { background: rgba(255,100,100,0.8) !important; color: #FFF !important; animation: d-dart-pulse 0.5s infinite !important; }
        .d-dart-approval-body { padding: 20px !important; }
        .d-dart-approval-order-id, .d-dart-approval-shipper, .d-dart-approval-charge-confirm { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 8px 12px !important; background: #37475A !important; border-radius: 6px !important; margin-bottom: 10px !important; }
        .d-dart-approval-label { font-size: 12px !important; color: #888 !important; }
        .d-dart-approval-value { font-size: 14px !important; font-weight: 600 !important; color: #FEBD69 !important; }
        .d-dart-approval-charge-info { background: #1a242f !important; border: 1px solid #485769 !important; border-radius: 8px !important; padding: 15px !important; margin-bottom: 15px !important; }
        .d-dart-approval-charge-title { font-size: 12px !important; color: #888 !important; margin-bottom: 10px !important; text-align: center !important; }
        .d-dart-approval-charge-details { margin-bottom: 10px !important; }
        .d-dart-approval-stop-line { font-size: 13px !important; color: #FFF !important; padding: 6px 0 !important; border-bottom: 1px solid #37475A !important; }
        .d-dart-approval-stop-line:last-child { border-bottom: none !important; }
        .d-dart-approval-stop-line strong { color: #ffd700 !important; }
        .d-dart-approval-total { display: flex !important; justify-content: space-between !important; align-items: center !important; padding-top: 10px !important; border-top: 2px solid #FF9900 !important; margin-top: 10px !important; }
        .d-dart-approval-total-label { font-size: 14px !important; font-weight: 600 !important; color: #FFF !important; }
        .d-dart-approval-total-value { font-size: 20px !important; font-weight: 700 !important; color: #ffd700 !important; }
        .d-dart-approval-question { font-size: 14px !important; color: #FFF !important; text-align: center !important; margin-bottom: 5px !important; }
        .d-dart-approval-buttons { display: flex !important; gap: 10px !important; padding: 15px 20px 20px !important; justify-content: center !important; }
        .d-dart-approval-btn { padding: 12px 24px !important; border: none !important; border-radius: 8px !important; font-size: 14px !important; font-weight: 700 !important; cursor: pointer !important; transition: all 0.2s ease !important; min-width: 100px !important; }
        .d-dart-approval-btn:hover { transform: translateY(-2px) !important; }
        .d-dart-approval-btn.yes { background: #00ff88 !important; color: #232F3E !important; }
        .d-dart-approval-btn.no { background: #ff6b6b !important; color: #FFF !important; }
        .d-dart-approval-btn.skip { background: #37475A !important; color: #FFF !important; border: 1px solid #485769 !important; }
        .d-dart-approval-btn.submit { background: #FF9900 !important; color: #232F3E !important; }
        .d-dart-approval-btn.cancel { background: #37475A !important; color: #FFF !important; }
        .d-dart-approval-auth-section { margin-top: 10px !important; }
        .d-dart-approval-auth-label { display: block !important; font-size: 12px !important; color: #888 !important; margin-bottom: 8px !important; }
        .d-dart-approval-auth-input { width: 100% !important; padding: 12px !important; border: 2px solid #37475A !important; border-radius: 6px !important; background: #1a242f !important; color: #FFF !important; font-size: 14px !important; outline: none !important; }
        .d-dart-approval-auth-input:focus { border-color: #FF9900 !important; }
        .d-dart-approval-auth-input.error { border-color: #ff6b6b !important; }
        .d-dart-approval-auth-error { color: #ff6b6b !important; font-size: 11px !important; margin-top: 5px !important; min-height: 16px !important; }

        #d-dart-resume-overlay { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.7) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 2147483650 !important; }
        .d-dart-resume-popup { background: #232F3E !important; border: 2px solid #FF9900 !important; border-radius: 12px !important; padding: 25px !important; text-align: center !important; max-width: 400px !important; }
        .d-dart-resume-title { font-size: 18px !important; font-weight: 700 !important; color: #FF9900 !important; margin-bottom: 15px !important; }
        .d-dart-resume-info { color: #FFF !important; margin-bottom: 20px !important; line-height: 1.6 !important; }
        .d-dart-resume-buttons { display: flex !important; gap: 10px !important; justify-content: center !important; }
        .d-dart-resume-btn { padding: 10px 20px !important; border: none !important; border-radius: 6px !important; font-weight: 600 !important; cursor: pointer !important; transition: all 0.2s ease !important; }
        .d-dart-resume-btn:hover { transform: translateY(-2px) !important; }
        .d-dart-resume-btn.yes { background: #00ff88 !important; color: #232F3E !important; }
        .d-dart-resume-btn.no { background: #37475A !important; color: #FFF !important; }

        .d-dart-copy-popup { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; background: #00ff88 !important; color: #232F3E !important; padding: 15px 30px !important; border-radius: 10px !important; font-size: 16px !important; font-weight: 700 !important; z-index: 2147483649 !important; box-shadow: 0 8px 30px rgba(0,0,0,0.4) !important; }

        #d-dart-body::-webkit-scrollbar { width: 5px !important; }
        #d-dart-body::-webkit-scrollbar-track { background: #1a242f !important; }
        #d-dart-body::-webkit-scrollbar-thumb { background: #37475A !important; border-radius: 3px !important; }
        #d-dart-body::-webkit-scrollbar-thumb:hover { background: #FF9900 !important; }
        .d-dart-batch-table-container::-webkit-scrollbar, .d-dart-shippers-list::-webkit-scrollbar, .d-dart-settings-body::-webkit-scrollbar { width: 4px !important; }
        .d-dart-batch-table-container::-webkit-scrollbar-track, .d-dart-shippers-list::-webkit-scrollbar-track, .d-dart-settings-body::-webkit-scrollbar-track { background: #1a242f !important; }
        .d-dart-batch-table-container::-webkit-scrollbar-thumb, .d-dart-shippers-list::-webkit-scrollbar-thumb, .d-dart-settings-body::-webkit-scrollbar-thumb { background: #485769 !important; border-radius: 2px !important; }
    `;

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 34: UI CONTROLLER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const UIController = (() => {
        let dom = null;
        let toastTimeout = null;
        let dragState = { isDragging: false, offsetX: 0, offsetY: 0 };
        let eventCleanupFns = [];
        let settingsCleanupFn = null;

        const injectStyles = () => { GM_addStyle(Styles); };

        const createDOM = () => {
            const container = document.createElement('div');
            container.id = 'd-dart';
            container.setAttribute('role', 'application');
            container.setAttribute('aria-label', Messages.ACCESSIBILITY.PANEL_LABEL);

            container.innerHTML = `
                <div id="d-dart-minimized-icon" title="Expand D-DART" role="button" tabindex="0">🚛</div>
                <div id="d-dart-header">
                    <h3>
                        🚛 D-DART
                        <span class="d-dart-version-badge">v${CONFIG.VERSION}</span>
                        <div class="d-dart-status-indicators">
                            <span class="d-dart-token-indicator" id="d-dart-token-indicator">🔐...</span>
                            <span class="d-dart-sow-indicator" id="d-dart-sow-indicator">📋...</span>
                        </div>
                    </h3>
                    <div class="d-dart-header-right">
                        <span class="d-dart-signature">${CONFIG.AUTHOR}</span>
                        <div class="d-dart-header-buttons">
                            <button class="d-dart-header-btn" id="d-dart-settings-btn" title="Settings">⚙️</button>
                            <button class="d-dart-header-btn" id="d-dart-reset-btn" title="Reset">↻</button>
                            <button class="d-dart-header-btn" id="d-dart-debug-btn" title="Debug">🔍</button>
                            <button class="d-dart-header-btn" id="d-dart-toggle" title="Minimize">−</button>
                        </div>
                    </div>
                </div>
                <div id="d-dart-body">
                    <div class="d-dart-input-group">
                        <input type="text" class="d-dart-input" id="d-dart-order-id" placeholder="Enter Order ID(s)" autocomplete="off" spellcheck="false">
                        <button class="d-dart-btn" id="d-dart-analyze-btn">Analyze</button>
                    </div>
                    <div id="d-dart-results-container" role="region" aria-live="polite"></div>
                </div>
            `;
            document.body.appendChild(container);

            const toast = document.createElement('div');
            toast.className = 'd-dart-toast';
            toast.id = 'd-dart-toast';
            toast.setAttribute('role', 'alert');
            document.body.appendChild(toast);

            dom = {
                container,
                body: document.getElementById('d-dart-body'),
                header: document.getElementById('d-dart-header'),
                toggle: document.getElementById('d-dart-toggle'),
                reset: document.getElementById('d-dart-reset-btn'),
                settings: document.getElementById('d-dart-settings-btn'),
                input: document.getElementById('d-dart-order-id'),
                analyzeBtn: document.getElementById('d-dart-analyze-btn'),
                results: document.getElementById('d-dart-results-container'),
                minimizedIcon: document.getElementById('d-dart-minimized-icon'),
                tokenIndicator: document.getElementById('d-dart-token-indicator'),
                sowIndicator: document.getElementById('d-dart-sow-indicator'),
                debugBtn: document.getElementById('d-dart-debug-btn'),
                toast
            };
        };

        const setupEventListeners = () => {
            const addListener = (element, event, handler, options) => {
                if (element) {
                    element.addEventListener(event, handler, options);
                    eventCleanupFns.push(() => element.removeEventListener(event, handler, options));
                }
            };

            addListener(dom.toggle, 'click', () => setMinimized(true));
            addListener(dom.minimizedIcon, 'click', (e) => { e.stopPropagation(); setMinimized(false); });
            addListener(dom.minimizedIcon, 'keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMinimized(false); } });
            addListener(dom.container, 'click', (e) => { if (AppState.get('isMinimized') && e.target === dom.container) setMinimized(false); });
            addListener(dom.reset, 'click', resetForm);
            addListener(dom.settings, 'click', openSettings);
            addListener(dom.input, 'keypress', (e) => { if (e.key === 'Enter' && !AppState.get('isProcessing')) startAnalysis(); });
            addListener(dom.input, 'input', () => { dom.input.classList.remove('error'); });
            addListener(dom.analyzeBtn, 'click', () => { if (!AppState.get('isProcessing')) startAnalysis(); });
            addListener(dom.debugBtn, 'click', copyDebugLog);
            addListener(dom.results, 'click', handleResultsClick);

            setupDragging();
        };

        const handleResultsClick = (e) => {
            const toggleEl = e.target.closest('[data-toggle-target]');
            if (toggleEl) {
                const target = document.getElementById(toggleEl.dataset.toggleTarget);
                if (target) target.classList.toggle(CSS_CLASSES.EXPANDED);
                return;
            }

            if (e.target.id === 'd-dart-download-csv') { downloadCSV(); return; }
            if (e.target.id === 'd-dart-download-txt') { downloadTXT(); return; }
            if (e.target.id === 'd-dart-sow-retry') { SOWConfigManager.fetch(); return; }
            if (e.target.id === 'd-dart-pause-btn') {
                BatchProcessor.pause();
                const pauseBtn = document.getElementById('d-dart-pause-btn');
                const resumeBtn = document.getElementById('d-dart-resume-btn');
                if (pauseBtn) pauseBtn.style.display = 'none';
                if (resumeBtn) resumeBtn.style.display = 'inline-block';
                return;
            }
            if (e.target.id === 'd-dart-resume-btn') {
                BatchProcessor.resume();
                const pauseBtn = document.getElementById('d-dart-pause-btn');
                const resumeBtn = document.getElementById('d-dart-resume-btn');
                if (resumeBtn) resumeBtn.style.display = 'none';
                if (pauseBtn) pauseBtn.style.display = 'inline-block';
                return;
            }
            if (e.target.id === 'd-dart-cancel-btn') {
                if (confirm('Cancel batch? Progress will be saved.')) BatchProcessor.cancel();
                return;
            }
        };

        const setupDragging = () => {
            const startDrag = (e) => {
                const ignoredSelectors = ['.d-dart-header-buttons', '.d-dart-input', '.d-dart-btn', '.d-dart-download-btn', 'a', '.d-dart-control-btn'];
                for (const selector of ignoredSelectors) {
                    if (e.target.closest(selector)) return;
                }
                dragState.isDragging = true;
                dom.container.classList.add(CSS_CLASSES.DRAGGING);
                const clientX = e.clientX || e.touches?.[0]?.clientX;
                const clientY = e.clientY || e.touches?.[0]?.clientY;
                dragState.offsetX = clientX - dom.container.offsetLeft;
                dragState.offsetY = clientY - dom.container.offsetTop;
                e.preventDefault();
            };

            const moveDrag = (e) => {
                if (!dragState.isDragging) return;
                e.preventDefault();
                const clientX = e.clientX || e.touches?.[0]?.clientX;
                const clientY = e.clientY || e.touches?.[0]?.clientY;
                requestAnimationFrame(() => {
                    let newX = Math.max(0, Math.min(clientX - dragState.offsetX, window.innerWidth - dom.container.offsetWidth));
                    let newY = Math.max(0, Math.min(clientY - dragState.offsetY, window.innerHeight - dom.container.offsetHeight));
                    dom.container.style.setProperty('left', `${newX}px`, 'important');
                    dom.container.style.setProperty('top', `${newY}px`, 'important');
                    dom.container.style.setProperty('right', 'auto', 'important');
                });
            };

            const endDrag = () => { dragState.isDragging = false; dom.container.classList.remove(CSS_CLASSES.DRAGGING); };

            dom.header.addEventListener('mousedown', startDrag);
            dom.container.addEventListener('mousedown', (e) => { if (AppState.get('isMinimized')) startDrag(e); });
            document.addEventListener('mousemove', moveDrag);
            document.addEventListener('mouseup', endDrag);
            dom.header.addEventListener('touchstart', startDrag, { passive: false });
            document.addEventListener('touchmove', moveDrag, { passive: false });
            document.addEventListener('touchend', endDrag);

            eventCleanupFns.push(() => {
                document.removeEventListener('mousemove', moveDrag);
                document.removeEventListener('mouseup', endDrag);
                document.removeEventListener('touchmove', moveDrag);
                document.removeEventListener('touchend', endDrag);
            });
        };

        const setupEventBusListeners = () => {
            EventBus.on('showToast', (message, type) => showToast(message, type));
            EventBus.on('tokenUpdate', updateTokenIndicator);
            EventBus.on('sowUpdate', updateSOWIndicator);
            EventBus.on('showProgress', showProgress);
            EventBus.on('updateProgressStep', updateProgressStep);
            EventBus.on('showBatchProgress', showEnhancedBatchProgress);
            EventBus.on('batchProgressUpdate', updateEnhancedBatchProgress);
            EventBus.on('batchStatusUpdate', updateBatchStatus);
            EventBus.on('batchComplete', showBatchComplete);
            EventBus.on('showProcessingError', showProcessingError);
            EventBus.on('displaySingleOrderResults', displaySingleOrderResults);
        };

        const setupStateSubscriptions = () => {
            AppState.subscribe('isProcessing', (isProcessing) => {
                dom.analyzeBtn.disabled = isProcessing || !SOWConfigManager.isLoaded();
                dom.analyzeBtn.textContent = isProcessing ? 'Processing...' : 'Analyze';
                dom.analyzeBtn.classList.toggle(CSS_CLASSES.LOADING, isProcessing);
                dom.input.disabled = isProcessing;
            });

            AppState.subscribe('isMinimized', updateMinimizedState);
            AppState.subscribe('sowStatus', () => { updateSOWIndicator(); updateAnalyzeButtonState(); });
        };

        const updateAnalyzeButtonState = () => {
            const isProcessing = AppState.get('isProcessing');
            const sowLoaded = SOWConfigManager.isLoaded();
            dom.analyzeBtn.disabled = isProcessing || !sowLoaded;
            dom.analyzeBtn.title = !sowLoaded && !isProcessing ? 'SOW not loaded' : '';
        };

        const setMinimized = (minimized) => {
            AppState.set('isMinimized', minimized);
            dom.container.classList.toggle(CSS_CLASSES.MINIMIZED, minimized);
            if (!minimized) setTimeout(() => dom.input.focus(), 100);
            Telemetry.track(TelemetryEventType.USER_ACTION, { action: minimized ? 'minimize' : 'expand' });
        };

        const updateMinimizedState = () => {
            const isHealthy = SOWConfigManager.isLoaded() && !TokenManager.isExpired();
            dom.container.classList.remove(CSS_CLASSES.HEALTHY, CSS_CLASSES.UNHEALTHY);
            dom.container.classList.add(isHealthy ? CSS_CLASSES.HEALTHY : CSS_CLASSES.UNHEALTHY);
        };

        const startAnalysis = () => {
            if (!SOWConfigManager.isLoaded()) {
                showToast(Messages.ERRORS.SOW_SERVER_UNREACHABLE, 'error');
                return;
            }

            const input = dom.input.value.trim();
            const validation = Validator.parseOrderIds(input);

            dom.input.classList.remove('error');

            if (!validation.valid || validation.sanitized.length === 0) {
                dom.input.classList.add('error');
                dom.input.focus();
                showToast(validation.errors[0] || Messages.ERRORS.INVALID_ORDER_IDS, 'error');
                return;
            }

            if (validation.errors.length > 0) {
                showToast(`${validation.sanitized.length} valid IDs, ${validation.errors.length} invalid`, 'warning');
            }

            AppState.set('isProcessing', true);
            BatchProcessor.processBatch(validation.sanitized).finally(() => AppState.set('isProcessing', false));
        };

        const resetForm = () => {
            dom.input.value = '';
            dom.input.classList.remove('error');
            dom.results.innerHTML = '';
            AppState.resetBatch();
            dom.input.focus();
            Telemetry.track(TelemetryEventType.USER_ACTION, { action: 'reset' });
        };

        const openSettings = () => {
            if (AppState.get('isSettingsOpen')) return;

            AppState.set('isSettingsOpen', true);

            const overlay = document.createElement('div');
            overlay.className = 'd-dart-settings-overlay';
            overlay.id = 'd-dart-settings-overlay';
            document.body.appendChild(overlay);

            const panelContainer = document.createElement('div');
            panelContainer.innerHTML = HTMLGenerator.settingsPanel();
            document.body.appendChild(panelContainer.firstElementChild);

            setupSettingsEventListeners();
            Telemetry.track(TelemetryEventType.USER_ACTION, { action: 'open_settings' });
        };

        const closeSettings = () => {
            AppState.set('isSettingsOpen', false);
            document.getElementById('d-dart-settings-overlay')?.remove();
            document.getElementById('d-dart-settings-panel')?.remove();
            if (settingsCleanupFn) { settingsCleanupFn(); settingsCleanupFn = null; }
        };

        const setupSettingsEventListeners = () => {
            const cleanupFns = [];

            const addSettingsListener = (id, event, handler) => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener(event, handler);
                    cleanupFns.push(() => el.removeEventListener(event, handler));
                }
            };

            addSettingsListener('d-dart-settings-close', 'click', closeSettings);

            addSettingsListener('d-dart-refresh-sow', 'click', async () => {
                const btn = document.getElementById('d-dart-refresh-sow');
                if (btn) { btn.disabled = true; btn.textContent = '⏳ Refreshing...'; }
                await SOWConfigManager.fetch();
                if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
                updateSettingsPanel();
            });

            addSettingsListener('d-dart-expand-all', 'click', () => {
                AppState.expandAllShippers(SOWConfigManager.getAllShippersData().map(s => s.shipperName));
                updateShippersList();
            });

            addSettingsListener('d-dart-collapse-all', 'click', () => {
                AppState.collapseAllShippers();
                updateShippersList();
            });

            const searchInput = document.getElementById('d-dart-shipper-search');
            if (searchInput) {
                const debouncedSearch = debounce(() => updateShippersList(), CONFIG.UI.DEBOUNCE_DELAY);
                const searchHandler = (e) => { AppState.set('settingsSearchTerm', e.target.value); debouncedSearch(); };
                searchInput.addEventListener('input', searchHandler);
                cleanupFns.push(() => searchInput.removeEventListener('input', searchHandler));
            }

            ['d-dart-filter-status', 'd-dart-filter-rate'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    const handler = (e) => {
                        const filters = AppState.get('settingsFilters');
                        const key = id === 'd-dart-filter-status' ? 'status' : 'rateType';
                        AppState.set('settingsFilters', { ...filters, [key]: e.target.value });
                        updateShippersList();
                    };
                    el.addEventListener('change', handler);
                    cleanupFns.push(() => el.removeEventListener('change', handler));
                }
            });

            const hideInactiveCheckbox = document.getElementById('d-dart-hide-inactive');
            if (hideInactiveCheckbox) {
                const handler = (e) => {
                    const filters = AppState.get('settingsFilters');
                    AppState.set('settingsFilters', { ...filters, hideInactive: e.target.checked });
                    updateShippersList();
                };
                hideInactiveCheckbox.addEventListener('change', handler);
                cleanupFns.push(() => hideInactiveCheckbox.removeEventListener('change', handler));
            }

            const shippersList = document.getElementById('d-dart-shippers-list');
            if (shippersList) {
                const handler = (e) => {
                    const header = e.target.closest('[data-toggle-shipper]');
                    if (header) {
                        AppState.toggleShipperExpanded(header.dataset.toggleShipper);
                        updateShippersList();
                    }
                };
                shippersList.addEventListener('click', handler);
                cleanupFns.push(() => shippersList.removeEventListener('click', handler));
            }

            const overlayEl = document.getElementById('d-dart-settings-overlay');
            if (overlayEl) {
                overlayEl.addEventListener('click', closeSettings);
                cleanupFns.push(() => overlayEl.removeEventListener('click', closeSettings));
            }

            const escapeHandler = (e) => { if (e.key === 'Escape' && AppState.get('isSettingsOpen')) closeSettings(); };
            document.addEventListener('keydown', escapeHandler);
            cleanupFns.push(() => document.removeEventListener('keydown', escapeHandler));

            settingsCleanupFn = () => cleanupFns.forEach(fn => fn());
        };

        const updateSettingsPanel = () => {
            const stats = SOWConfigManager.getStatistics();
            const lastRefresh = SOWConfigManager.getLastRefreshTime();

            const setContent = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            setContent('d-dart-stats-total', stats.total);
            setContent('d-dart-stats-active', stats.active);
            setContent('d-dart-stats-inactive', stats.inactive);
            setContent('d-dart-stats-errors', stats.validationErrors);
            setContent('d-dart-last-refresh', `🕐 Last Refresh: ${Helpers.formatRelativeTime(lastRefresh)}`);

            updateShippersList();
        };

        const updateShippersList = () => {
            const shippersList = document.getElementById('d-dart-shippers-list');
            if (shippersList) shippersList.innerHTML = HTMLGenerator.renderShippersList();
        };

        const copyDebugLog = async () => {
            try {
                await Helpers.copyToClipboard(Logger.generateReport());
                const popup = document.createElement('div');
                popup.className = 'd-dart-copy-popup';
                popup.textContent = `✅ ${Messages.SUCCESS.DEBUG_COPIED}`;
                document.body.appendChild(popup);
                setTimeout(() => popup.remove(), CONFIG.UI.COPY_POPUP_DURATION);
            } catch (e) {
                showToast(Messages.ERRORS.COPY_FAILED, 'error');
            }
        };

        const downloadCSV = () => {
            const data = AppState.get('batchReportData');
            if (!data?.length) { showToast(Messages.ERRORS.NO_DATA, 'error'); return; }
            Helpers.downloadFile(ReportGenerator.generateCSV(data), `D-DART_Report_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
            showToast(Messages.SUCCESS.CSV_DOWNLOADED, 'success');
        };

        const downloadTXT = () => {
            const data = AppState.get('batchReportData');
            if (!data?.length) { showToast(Messages.ERRORS.NO_DATA, 'error'); return; }
            Helpers.downloadFile(ReportGenerator.generateTXT(data), `D-DART_Report_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
            showToast(Messages.SUCCESS.TXT_DOWNLOADED, 'success');
        };

        const checkSOWErrorDisplay = () => {
            const sowStatus = AppState.get('sowStatus');
            const sowError = AppState.get('sowLastError');
            if (sowStatus === SOWStatus.ERROR || sowStatus === SOWStatus.AUTH_REQUIRED) {
                dom.results.innerHTML = HTMLGenerator.sowErrorDisplay(sowError || Messages.ERRORS.SOW_SERVER_UNREACHABLE, sowStatus === SOWStatus.AUTH_REQUIRED);
            }
        };

        const updateTokenIndicator = () => {
            const status = TokenManager.getStatus();
            if (dom?.tokenIndicator) {
                let displayText = '🔐';
                if (['ready', 'warning', 'critical'].includes(status.status)) displayText = `🔐${status.remainingSeconds}s`;
                else if (status.status === 'fetching') displayText = '🔐⏳';
                else displayText = '🔐❌';

                dom.tokenIndicator.textContent = displayText;
                dom.tokenIndicator.className = `d-dart-token-indicator ${status.class}`;
                dom.tokenIndicator.title = `Token: ${status.status}`;
            }
            updateMinimizedState();
        };

        const updateSOWIndicator = () => {
            const sowStatus = AppState.get('sowStatus');
            const shipperCount = AppState.get('sowShipperCount');

            if (dom?.sowIndicator) {
                let displayText = '📋', cssClass = '', title = '';
                switch (sowStatus) {
                    case SOWStatus.LOADED: displayText = `📋${shipperCount}`; cssClass = CSS_CLASSES.SOW_LOADED; title = `SOW: ${shipperCount} shippers`; break;
                    case SOWStatus.LOADING: displayText = '📋⏳'; cssClass = CSS_CLASSES.SOW_LOADING; title = 'Loading SOW...'; break;
                    case SOWStatus.AUTH_REQUIRED: displayText = '📋🔐'; cssClass = CSS_CLASSES.SOW_ERROR; title = 'SharePoint login required'; break;
                    case SOWStatus.ERROR: displayText = '📋❌'; cssClass = CSS_CLASSES.SOW_ERROR; title = 'SOW load failed'; break;
                    default: displayText = '📋...'; title = 'SOW not loaded';
                }
                dom.sowIndicator.textContent = displayText;
                dom.sowIndicator.className = `d-dart-sow-indicator ${cssClass}`;
                dom.sowIndicator.title = title;
            }
            updateMinimizedState();
            checkSOWErrorDisplay();
        };

        const showProgress = (steps) => {
            dom.results.innerHTML = `
                <div class="d-dart-progress">
                    <div class="d-dart-progress-title">🔄 Processing Order...</div>
                    <div class="d-dart-progress-steps">
                        ${steps.map(step => `
                            <div class="d-dart-step ${CSS_CLASSES.PENDING}" id="d-dart-step-${step.id}">
                                <span class="d-dart-step-icon">${step.icon}</span>
                                <span class="d-dart-step-text">${Helpers.escapeHtml(step.text)}</span>
                                <span class="d-dart-step-status" id="d-dart-step-status-${step.id}"></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        const updateProgressStep = (stepId, status, statusText = '') => {
            const stepEl = document.getElementById(`d-dart-step-${stepId}`);
            const statusEl = document.getElementById(`d-dart-step-status-${stepId}`);
            if (stepEl) stepEl.className = `d-dart-step ${status}`;
            if (statusEl && statusText) statusEl.textContent = statusText;
        };

        const showEnhancedBatchProgress = (totalOrders, totalChunks) => {
            dom.results.innerHTML = HTMLGenerator.enhancedBatchProgress(totalOrders, totalChunks);
        };

        const updateEnhancedBatchProgress = (data) => {
            const { processed, success, failed, total, startTime } = data;
            const remaining = total - processed;
            const percent = Math.round((processed / total) * 100);

            const setContent = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            setContent('d-dart-stat-processed', processed);
            setContent('d-dart-stat-success', success);
            setContent('d-dart-stat-failed', failed);
            setContent('d-dart-stat-remaining', remaining);

            const progressBar = document.getElementById('d-dart-progress-bar');
            if (progressBar) progressBar.style.width = `${percent}%`;

            setContent('d-dart-chunk-info', `${AppState.get('currentChunk') + 1}/${AppState.get('totalChunks')}`);

            if (processed >= 5 && startTime) {
                const elapsed = Date.now() - startTime;
                const etaMs = remaining * (elapsed / processed);
                const etaEl = document.getElementById('d-dart-progress-eta');
                if (etaEl) etaEl.textContent = `ETA: ${Helpers.formatETA(etaMs)}`;
            }

            const tokenStatus = document.getElementById('d-dart-token-status');
            if (tokenStatus) {
                const remainingSec = TokenManager.getRemainingSeconds();
                tokenStatus.textContent = remainingSec > 0 ? `${remainingSec}s` : 'Expired';
                tokenStatus.className = remainingSec > 30 ? 'token-ok' : remainingSec > 0 ? 'token-warning' : 'token-error';
            }
        };

        const updateBatchStatus = (status) => {
            const statusEl = document.getElementById('d-dart-progress-status');
            if (statusEl) statusEl.textContent = status;
        };

        const showBatchComplete = (reportData) => {
            dom.results.innerHTML = HTMLGenerator.batchReportTable(reportData);
        };

        const showProcessingError = (message) => {
            dom.results.innerHTML = `
                <div class="d-dart-error" role="alert">
                    <div class="d-dart-error-icon">❌</div>
                    <div class="d-dart-error-title">Processing Failed</div>
                    <div class="d-dart-error-message">${Helpers.escapeHtml(message)}</div>
                </div>
            `;
        };

        const displaySingleOrderResults = (orderData) => {
            const analysisResults = orderData?.analysisResults || [];
            const smcExecutionData = orderData?.smcExecutionData;
            const stops = orderData?.viewData?.stops || [];

            let html = '<div class="d-dart-results">';
            html += HTMLGenerator.detentionSummaryBanner(orderData);
            html += HTMLGenerator.shipperCard(orderData);
            html += '<div class="d-dart-section-title">Stop Analysis</div>';

            for (let i = 0; i < analysisResults.length; i++) {
                html += HTMLGenerator.stopCard(stops[i], analysisResults[i], orderData?.sowConfig, smcExecutionData);
            }

            html += '</div>';
            dom.results.innerHTML = html;
        };

        const showToast = (message, type = 'info') => {
            if (toastTimeout) clearTimeout(toastTimeout);
            dom.toast.textContent = message;
            dom.toast.className = `d-dart-toast ${type} show`;
            toastTimeout = setTimeout(() => dom.toast.classList.remove('show'), CONFIG.UI.TOAST_DURATION);
        };

        return {
            init() {
                injectStyles();
                createDOM();
                setupEventListeners();
                setupEventBusListeners();
                setupStateSubscriptions();
                TokenManager.init();
                updateTokenIndicator();
                updateSOWIndicator();
                if (CONFIG.START_MINIMIZED) {
                    dom.container.classList.add(CSS_CLASSES.MINIMIZED);
                    AppState.set('isMinimized', true);
                }
                Logger.info('UI initialized');
                Telemetry.track(TelemetryEventType.APP_INIT, { isOnSMC: Helpers.isOnSMC(), startMinimized: CONFIG.START_MINIMIZED });
            },

            destroy() {
                eventCleanupFns.forEach(fn => fn());
                eventCleanupFns = [];
                if (settingsCleanupFn) { settingsCleanupFn(); settingsCleanupFn = null; }
                AppState.clearListeners();
                EventBus.clear();
                if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
                if (AppState.get('isSettingsOpen')) closeSettings();
                dom?.container?.remove();
                dom?.toast?.remove();
                ApprovalPopup.cleanup();
                TokenManager.cleanup();
                CacheManager.cleanup();
                ProgressManager.clear();
                Telemetry.cleanup();
                Logger.info('UI destroyed');
            },

            showToast
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 35: APPLICATION INITIALIZATION
     * ═══════════════════════════════════════════════════════════════════════════ */

    const App = {
        async checkVersion() {
            if (!CONFIG.FEATURES.AUTO_UPDATE_CHECK) {
                Logger.info('Auto-update check disabled');
                return true;
            }

            Logger.info('Starting version check...');
            UpdateBlocker.showChecking();

            const result = await VersionChecker.check();

            if (!result.success) {
                Logger.error('Version check failed', result.error);
                UpdateBlocker.showError(result.error, () => this.checkVersion());
                return false;
            }

            if (result.updateRequired && CONFIG.FEATURES.FORCE_VERSION_MATCH) {
                Logger.warn(`Version mismatch: current=${CONFIG.VERSION}, latest=${result.latestVersion}`);
                UpdateBlocker.showUpdateRequired(CONFIG.VERSION, result.latestVersion, result.latestFileUrl);
                return false;
            }

            Logger.info('Version check passed');
            UpdateBlocker.hide();
            return true;
        },

        async init() {
            Logger.info(`=== D-DART v${CONFIG.VERSION} ${CONFIG.APP_SUBTITLE} Starting ===`);
            Logger.info(`Page: ${window.location.href}`);
            Logger.info(`On SMC: ${Helpers.isOnSMC()}`);

            try {
                const versionOk = await this.checkVersion();
                if (!versionOk) {
                    Logger.warn('Application blocked due to version check');
                    Telemetry.track(TelemetryEventType.APP_INIT, { success: false, reason: 'version_check_failed' });
                    return;
                }

                UIController.init();

                Logger.info('Loading SOW configuration...');
                await SOWConfigManager.init();

                Logger.info(`=== D-DART v${CONFIG.VERSION} Ready ===`);
                Telemetry.track(TelemetryEventType.APP_INIT, { success: true, sowLoaded: SOWConfigManager.isLoaded(), shipperCount: SOWConfigManager.getShipperCount() });

            } catch (error) {
                Logger.error('Initialization failed', error.message);
                console.error('D-DART initialization failed:', error);
                Telemetry.track(TelemetryEventType.APP_ERROR, { phase: 'init', error: error.message });
            }
        },

        getInfo() {
            return {
                name: CONFIG.APP_NAME,
                version: CONFIG.VERSION,
                edition: CONFIG.APP_SUBTITLE,
                author: CONFIG.AUTHOR,
                maxBatchSize: CONFIG.BATCH.MAX_ORDERS_PER_SESSION,
                state: AppState.getSnapshot(),
                tokenStatus: TokenManager.getStatus(),
                sowStatus: SOWConfigManager.getStatus(),
                updateStatus: VersionChecker.getStatus(),
                cacheStats: CacheManager.getStats(),
                batchState: BatchProcessor.getState(),
                performance: PerformanceMonitor.getMetrics(),
                telemetry: Telemetry.getMetrics(),
                circuitBreakers: {
                    smc: circuitBreakers.smc.getState(),
                    fmc: circuitBreakers.fmc.getState(),
                    execution: circuitBreakers.execution.getState(),
                    sharepoint: circuitBreakers.sharepoint.getState(),
                    github: circuitBreakers.github.getState()
                }
            };
        },

        destroy() {
            UIController.destroy();
            SOWConfigManager.clear();
            UpdateBlocker.hide();
            Logger.info('Application destroyed');
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }

    // Expose for debugging (only in debug mode)
    if (CONFIG.FEATURES.DEBUG_MODE) {
        window.DDART = {
            App,
            AppState,
            Logger,
            TokenManager,
            SOWConfigManager,
            CacheManager,
            ProgressManager,
            BatchProcessor,
            PerformanceMonitor,
            Telemetry,
            DetentionAnalyzer,
            VersionChecker,
            UpdateBlocker,
            CONFIG,
            version: CONFIG.VERSION,
            edition: CONFIG.APP_SUBTITLE,
            test: {
                analyzeOrder: (orderId) => BatchProcessor.processBatch([orderId]),
                analyzeBatch: (orderIds) => BatchProcessor.processBatch(orderIds),
                getState: () => AppState.getSnapshot(),
                clearCache: () => CacheManager.clear(),
                clearProgress: () => ProgressManager.clear(),
                refreshToken: () => TokenManager.ensure(),
                refreshSOW: () => SOWConfigManager.fetch(),
                getSOWConfig: (shipper) => SOWConfigManager.getConfig(shipper),
                getAllShippers: () => SOWConfigManager.getShipperNames(),
                getAllShippersData: () => SOWConfigManager.getAllShippersData(),
                getSOWStats: () => SOWConfigManager.getStatistics(),
                showToast: (msg, type) => UIController.showToast(msg, type),
                generateReport: () => Logger.generateReport(),
                pauseBatch: () => BatchProcessor.pause(),
                resumeBatch: () => BatchProcessor.resume(),
                cancelBatch: () => BatchProcessor.cancel(),
                getInfo: () => App.getInfo(),
                getPerformance: () => PerformanceMonitor.getMetrics(),
                getTelemetry: () => Telemetry.getMetrics(),
                checkVersion: () => VersionChecker.check(),
                getVersionStatus: () => VersionChecker.getStatus(),
                resetCircuitBreakers: () => {
                    Object.values(circuitBreakers).forEach(cb => cb.reset());
                    Logger.info('All circuit breakers reset');
                }
            }
        };
    }

})();