// ==UserScript==
// @name         D-DART (Driver Detention Analysis & Review Tool) v10.5
// @namespace    http://tampermonkey.net/
// @version      10.5
// @description  Enterprise Batch Driver Detention Analysis & Review Tool - Fully Optimized & Bug-Free
// @author       Sachin Vallakati
// @match        *://share.amazon.com/*
// @match        *://trans-logistics.amazon.com/*
// @match        *://smc-na-iad.iad.proxy.amazon.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/vallsach/DDART-Releases/main/d-dart.user.js
// @downloadURL  https://raw.githubusercontent.com/vallsach/DDART-Releases/main/d-dart.user.js
// @connect      smc-na-iad.iad.proxy.amazon.com
// @connect      smc.amazon.com
// @connect      us-east-1.prod.api.execution-tools.freight.amazon.dev
// @connect      trans-logistics.amazon.com
// @connect      amazon.sharepoint.com
// @connect      raw.githubusercontent.com
// @connect      *
// @run-at       document-end
// ==/UserScript==

/**
 * @fileoverview D-DART - Driver Detention Analysis & Review Tool v10.5
 * Enterprise-grade tool for analyzing and processing driver detention charges
 * with dynamic SOW configuration from SharePoint and Settings Panel.
 *
 * @author Sachin Vallakati
 * @version 10.5
 * @license MIT
 *
 * @changelog v10.5
 * - Added CREATE_HOLD_ONLY action type for Analysis Only mode
 * - Settings panel now opens inline within tool panel (not popup)
 * - Fixed detention hold detection to use exact match only (DETENTION_DRIVER_AT_SHIPPER/RECEIVER)
 * - Analysis Only mode now creates $0 hold silently (no comment) for manual review
 * - Added HOLD_CREATED display config for batch reports
 * - Improved UX with back button in inline settings
 * - Added automatic update system with GitHub integration
 * - Version check on startup with 1-hour cache
 * - Blocking modal for version mismatches
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

    /**
     * @typedef {Object} TelemetryEvent
     * @property {string} event - Event name
     * @property {Object} data - Event data
     * @property {number} timestamp - Event timestamp
     * @property {string} sessionId - Session identifier
     */

    /**
     * @typedef {Object} VersionCache
     * @property {number} timestamp - When the check was performed
     * @property {string} remoteVersion - Version from GitHub
     * @property {Array<string>} releaseNotes - Release notes array
     * @property {string} releaseDate - Release date string
     */

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 2: CONFIGURATION (All Magic Numbers Extracted)
     * ═══════════════════════════════════════════════════════════════════════════ */

    const CONFIG = Object.freeze({
        VERSION: '10.5',
        APP_NAME: 'D-DART',
        APP_SUBTITLE: 'Production',
        AUTHOR: 'Sachin Vallakati',

        // Update System Configuration
        UPDATE: Object.freeze({
            GITHUB_USERNAME: 'vallsach',
            GITHUB_REPO: 'DDART-Releases',
            VERSION_FILE: 'version.json',
            SCRIPT_FILE: 'd-dart.user.js',
            get VERSION_URL() {
                return `https://raw.githubusercontent.com/${CONFIG.UPDATE.GITHUB_USERNAME}/${CONFIG.UPDATE.GITHUB_REPO}/main/${CONFIG.UPDATE.VERSION_FILE}`;
            },
            get SCRIPT_URL() {
                return `https://raw.githubusercontent.com/${CONFIG.UPDATE.GITHUB_USERNAME}/${CONFIG.UPDATE.GITHUB_REPO}/main/${CONFIG.UPDATE.SCRIPT_FILE}`;
            },
            CHECK_TIMEOUT: 10000,
            CACHE_DURATION: 60 * 60 * 1000, // 1 hour in milliseconds
            CACHE_KEY: 'ddart_version_cache',
            BLOCK_ON_ERROR: true
        }),

        // SharePoint Configuration
        SHAREPOINT: Object.freeze({
            SITE_URL: 'https://amazon.sharepoint.com/sites/DDART-Config',
            LIST_NAME: 'SOWConfiguration',
            API_URL: 'https://amazon.sharepoint.com/sites/DDART-Config/_api/web/lists/getbytitle(\'SOWConfiguration\')/items',
            REQUEST_TIMEOUT: 30000
        }),

        // Cache Settings
        CACHE: Object.freeze({
            DURATION: 5 * 60 * 1000,
            MAX_SIZE: 200,
            SOW_DURATION: 24 * 60 * 60 * 1000,
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
            SCROLL_DEBOUNCE: 100,
            SEARCH_DEBOUNCE: 200,
            VIRTUAL_SCROLL_ITEM_HEIGHT: 60,
            VIRTUAL_SCROLL_BUFFER: 5
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
            RESET_TIMEOUT: 30000,
            HALF_OPEN_TIMEOUT: 5000
        }),

        // Enterprise Batch Settings
        BATCH: Object.freeze({
            PARALLEL_SIZE: 5,
            MAX_ORDERS_PER_SESSION: 2000,
            CHUNK_SIZE: 50,
            CHUNK_DELAY: 1500,
            RATE_LIMIT_DELAY: 800,
            PROGRESS_SAVE_INTERVAL: 10,
            STORAGE_KEY: 'ddart_batch_progress',
            UI_UPDATE_INTERVAL: 300,
            PAUSE_CHECK_INTERVAL: 500,
            COOLDOWN_STATUS_DURATION: 1000
        }),

        // Virtual Scrolling Settings
        VIRTUAL_SCROLL: Object.freeze({
            ENABLED: true,
            ITEMS_PER_PAGE: 20,
            BUFFER_SIZE: 5,
            THRESHOLD: 100
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

        // URL Patterns
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
            'raw.githubusercontent.com'
        ]),

        // Keyboard Shortcuts
        KEYBOARD: Object.freeze({
            TOGGLE_MINIMIZE: 'Escape',
            ANALYZE: 'Enter',
            RESET: 'KeyR',
            SETTINGS: 'KeyS',
            DEBUG: 'KeyD'
        }),

        INITIAL_POSITION: Object.freeze({
            top: '20px',
            left: '20px',
            right: 'auto'
        }),

        // Feature Flags
        FEATURES: Object.freeze({
            TELEMETRY_ENABLED: true,
            UNDO_ENABLED: true,
            KEYBOARD_SHORTCUTS: true,
            VIRTUAL_SCROLLING: true,
            CHARGE_PREVIEW: true,
            FUZZY_SEARCH: true,
            AUTO_UPDATE: true
        }),

        START_MINIMIZED: true,
        MAX_DEBUG_LOGS: 300,
        DEBUG_ENABLED: true,

        // Progress Persistence
        PROGRESS: Object.freeze({
            MAX_AGE: 7200000,
            SAVE_THROTTLE: 5000
        }),

        // Telemetry
        TELEMETRY: Object.freeze({
            MAX_EVENTS: 1000,
            FLUSH_INTERVAL: 60000,
            SESSION_TIMEOUT: 1800000
        })
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 3: CENTRALIZED MESSAGES
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
            INVALID_STATE: 'Invalid application state detected',
            CLEANUP_FAILED: 'Failed to cleanup resources',
            VERSION_CHECK_FAILED: 'Unable to verify version. Please check your internet connection.',
            GITHUB_UNREACHABLE: 'Cannot connect to update server. Please try again later.'
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
            ACTION_UNDONE: 'Action undone successfully',
            SETTINGS_SAVED: 'Settings saved'
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
            KEYBOARD_SHORTCUT: (key, action) => `Press ${key} to ${action}`
        }),
        COMMENTS: Object.freeze({
            ADD_CHARGE: 'Driver Detention Charge Added',
            RELEASE_HOLD: 'As per FMC time stamps there is no delay for this load, there are no emails for the delay hence releasing the $0 DD charge.',
            CHARGE_WITH_AUTH: (authNumber) => `Driver Detention Charge Added - (${authNumber})`,
            APPROVAL_DECLINED: 'Shipper rejected DD charge, Releasing DD hold.'
        }),
        UPDATE: Object.freeze({
            TITLE: '⚠️ D-DART UPDATE REQUIRED',
            UPGRADE_BODY: 'A newer version of D-DART is available. You must update to continue using this tool.',
            DOWNGRADE_BODY: 'Your version is newer than required. Please reinstall the correct version to ensure compatibility.',
            CHECKING: 'Checking for updates...',
            BUTTON_TEXT: '🔄 UPDATE NOW',
            CURRENT_VERSION: 'Your Version',
            REQUIRED_VERSION: 'Required Version',
            RELEASE_NOTES_TITLE: 'What\'s New',
            INSTRUCTIONS: 'Click the button above. Tampermonkey will automatically prompt you to install the update.',
            BLOCKED_TITLE: '🚫 D-DART UNAVAILABLE',
            BLOCKED_BODY: 'Unable to verify D-DART version. The tool cannot start without version verification.',
            RETRY_BUTTON: '🔄 RETRY CONNECTION',
            CHECKING_TITLE: '🔄 Checking for Updates',
            CHECKING_BODY: 'Please wait while we verify your D-DART version...'
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
            SKIP_ORDER: 'Skip this order'
        })
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 4: ENUMERATIONS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const UpdateStatus = Object.freeze({
        CHECKING: 'CHECKING',
        CURRENT: 'CURRENT',
        UPDATE_REQUIRED: 'UPDATE_REQUIRED',
        DOWNGRADE_REQUIRED: 'DOWNGRADE_REQUIRED',
        ERROR: 'ERROR',
        OFFLINE: 'OFFLINE'
    });

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
        CREATE_HOLD_ONLY: 'CREATE_HOLD_ONLY',
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
        STATE: 'STATE_ERROR',
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
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        INCOMPLETE: 'INCOMPLETE'
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
        PERFORMANCE: 'PERFORMANCE',
        VERSION_CHECK: 'VERSION_CHECK'
    });

    const OrderStatusMap = Object.freeze({
        'IN_DRAFT': { display: 'Draft', color: '#337ab7', group: 'draft' },
        'NOT_PLANNED': { display: 'Uncovered', color: '#337ab7', group: 'planning' },
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
        'CANCELLED': { display: 'Cancelled', color: '#d9534f', group: 'cancelled' },
        'REJECTED': { display: 'Rejected', color: '#d9534f', group: 'cancelled' }
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
        CHARGE_ADDED: Object.freeze({
            term: 'Charge Added',
            icon: '✅',
            display: (amount) => `✅ Charge Added - $${amount.toFixed(2)}`,
            reportTerm: 'Charge Added',
            cssClass: 'added'
        }),
        RECOVERED: Object.freeze({
            term: '🎯 Recovered',
            icon: '🎯',
            display: (amount) => `🎯 Recovered - $${amount.toFixed(2)}`,
            reportTerm: '🎯 Recovered',
            cssClass: 'recovered'
        }),
        HOLD_RELEASED: Object.freeze({
            term: 'Hold Released',
            icon: '✅',
            display: () => '✅ Hold Released',
            reportTerm: 'Hold Released',
            cssClass: 'released'
        }),
        HOLD_CREATED: Object.freeze({
            term: 'Hold Created',
            icon: '📋',
            display: () => '📋 $0 Hold Created (Analysis Only)',
            reportTerm: 'Hold Created',
            cssClass: 'hold-created'
        }),
        ANALYSIS_ONLY: Object.freeze({
            term: 'Analysis Only',
            icon: '📊',
            display: (amount) => `📊 Analysis Only - $${amount ? amount.toFixed(2) : '0.00'}`,
            reportTerm: 'Analysis Only',
            cssClass: 'analysis'
        }),
        PENDING: Object.freeze({
            term: 'Pending',
            icon: '⏳',
            display: (reason) => `⏳ Pending${reason ? ' - ' + reason : ''}`,
            reportTerm: 'Pending',
            cssClass: 'pending'
        }),
        NO_ACTION: Object.freeze({
            term: 'No Action',
            icon: '—',
            display: () => '— No Action',
            reportTerm: 'No Action',
            cssClass: 'no-action'
        }),
        ERROR: Object.freeze({
            term: 'Error',
            icon: '❌',
            display: (message) => `❌ Error${message ? ' - ' + message : ''}`,
            reportTerm: 'Error',
            cssClass: 'error'
        })
    });

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 5: UTILITY FUNCTIONS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const generateSessionId = () => {
        return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
    };

    const deepFreeze = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        Object.freeze(obj);
        Object.keys(obj).forEach(key => deepFreeze(obj[key]));
        return obj;
    };

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
                if (seen.has(value)) {
                    return '[Circular Reference]';
                }
                seen.add(value);
            }
            return value;
        }, indent);
    };

    const parseBoolean = (value, defaultValue = false) => {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.toLowerCase().trim();
            if (['true', 'yes', '1', 'on', 'enabled'].includes(normalized)) {
                return true;
            }
            if (['false', 'no', '0', 'off', 'disabled'].includes(normalized)) {
                return false;
            }
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        return defaultValue;
    };

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

    const throttle = (func, limit) => {
        let inThrottle;
        return function executedFunction(...args) {
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => { inThrottle = false; }, limit);
            }
        };
    };

    const fuzzyMatch = (needle, haystack) => {
        if (!needle || !haystack) return false;
        const needleLower = needle.toLowerCase();
        const haystackLower = haystack.toLowerCase();

        if (haystackLower.includes(needleLower)) return true;

        let needleIndex = 0;
        for (let i = 0; i < haystackLower.length && needleIndex < needleLower.length; i++) {
            if (haystackLower[i] === needleLower[needleIndex]) {
                needleIndex++;
            }
        }
        return needleIndex === needleLower.length;
    };

    const chunkArray = (array, size) => {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 6: TELEMETRY SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Telemetry = (() => {
        const events = [];
        const sessionId = generateSessionId();
        let flushTimeout = null;
        let isEnabled = CONFIG.FEATURES.TELEMETRY_ENABLED;

        const track = (eventType, data = {}) => {
            if (!isEnabled) return;

            const event = {
                event: eventType,
                data: {
                    ...data,
                    version: CONFIG.VERSION,
                    url: window.location.hostname
                },
                timestamp: Date.now(),
                sessionId
            };

            events.push(event);

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
            if (CONFIG.DEBUG_ENABLED && events.length > 0) {
                console.log(`🚛 D-DART Telemetry: ${events.length} events in session ${sessionId}`);
            }
        };

        const getEvents = () => [...events];
        const getSessionId = () => sessionId;
        const setEnabled = (enabled) => { isEnabled = enabled; };

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

        return { track, flush, getEvents, getSessionId, setEnabled, getMetrics, cleanup };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 6.5: VERSION MANAGER (NEW)
     * ═══════════════════════════════════════════════════════════════════════════ */

    const VersionManager = (() => {
        let currentOverlay = null;

        /**
         * Get cached version data
         * @returns {VersionCache|null}
         */
        const getCachedVersion = () => {
            try {
                const cached = GM_getValue(CONFIG.UPDATE.CACHE_KEY, null);
                if (!cached) return null;

                const data = typeof cached === 'string' ? JSON.parse(cached) : cached;

                // Check if cache is still valid (less than 1 hour old)
                if (Date.now() - data.timestamp < CONFIG.UPDATE.CACHE_DURATION) {
                    return data;
                }

                // Cache expired
                return null;
            } catch (e) {
                console.error('D-DART: Error reading version cache', e);
                return null;
            }
        };

        /**
         * Save version data to cache
         * @param {Object} versionData
         */
        const setCachedVersion = (versionData) => {
            try {
                const cacheData = {
                    timestamp: Date.now(),
                    remoteVersion: versionData.version,
                    releaseNotes: versionData.releaseNotes || [],
                    releaseDate: versionData.releaseDate || ''
                };
                GM_setValue(CONFIG.UPDATE.CACHE_KEY, JSON.stringify(cacheData));
            } catch (e) {
                console.error('D-DART: Error saving version cache', e);
            }
        };

        /**
         * Fetch version from GitHub
         * @returns {Promise<Object>}
         */
        const fetchRemoteVersion = () => {
            return new Promise((resolve, reject) => {
                // Add cache-busting parameter
                const url = `${CONFIG.UPDATE.VERSION_URL}?t=${Date.now()}`;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    timeout: CONFIG.UPDATE.CHECK_TIMEOUT,
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                resolve(data);
                            } catch (e) {
                                reject(new Error('Failed to parse version data'));
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
            });
        };

        /**
         * Compare versions
         * @param {string} localVersion
         * @param {string} remoteVersion
         * @returns {string} UpdateStatus
         */
        const compareVersions = (localVersion, remoteVersion) => {
            if (localVersion === remoteVersion) {
                return UpdateStatus.CURRENT;
            }

            // Parse versions for comparison
            const parseVersion = (v) => {
                const parts = String(v).split('.').map(p => parseInt(p, 10) || 0);
                while (parts.length < 3) parts.push(0);
                return parts;
            };

            const local = parseVersion(localVersion);
            const remote = parseVersion(remoteVersion);

            for (let i = 0; i < 3; i++) {
                if (local[i] < remote[i]) {
                    return UpdateStatus.UPDATE_REQUIRED;
                }
                if (local[i] > remote[i]) {
                    return UpdateStatus.DOWNGRADE_REQUIRED;
                }
            }

            // If we get here, versions are different but numerically equal (edge case)
            // Treat as update required to force exact match
            return UpdateStatus.UPDATE_REQUIRED;
        };

        /**
         * Show the checking modal
         */
        const showCheckingModal = () => {
            removeOverlay();

            const overlay = document.createElement('div');
            overlay.id = 'd-dart-update-overlay';
            overlay.innerHTML = `
                <div class="d-dart-update-modal">
                    <div class="d-dart-update-icon checking">🔄</div>
                    <div class="d-dart-update-title">${Messages.UPDATE.CHECKING_TITLE}</div>
                    <div class="d-dart-update-body">${Messages.UPDATE.CHECKING_BODY}</div>
                    <div class="d-dart-update-spinner"></div>
                </div>
            `;

            document.body.appendChild(overlay);
            currentOverlay = overlay;
        };

        /**
         * Show the blocking update modal
         * @param {Object} options
         */
        const showUpdateModal = (options) => {
            const { localVersion, remoteVersion, releaseNotes, releaseDate, isDowngrade } = options;

            removeOverlay();

            const releaseNotesHtml = releaseNotes && releaseNotes.length > 0
                ? `
                    <div class="d-dart-update-notes">
                        <div class="d-dart-update-notes-title">${Messages.UPDATE.RELEASE_NOTES_TITLE}</div>
                        <ul class="d-dart-update-notes-list">
                            ${releaseNotes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}
                        </ul>
                    </div>
                `
                : '';

            const overlay = document.createElement('div');
            overlay.id = 'd-dart-update-overlay';
            overlay.innerHTML = `
                <div class="d-dart-update-modal">
                    <div class="d-dart-update-icon ${isDowngrade ? 'downgrade' : 'upgrade'}">
                        ${isDowngrade ? '⬇️' : '⬆️'}
                    </div>
                    <div class="d-dart-update-title">${Messages.UPDATE.TITLE}</div>
                    <div class="d-dart-update-body">
                        ${isDowngrade ? Messages.UPDATE.DOWNGRADE_BODY : Messages.UPDATE.UPGRADE_BODY}
                    </div>
                    <div class="d-dart-update-versions">
                        <div class="d-dart-update-version-row">
                            <span class="d-dart-update-version-label">${Messages.UPDATE.CURRENT_VERSION}:</span>
                            <span class="d-dart-update-version-value local">${escapeHtml(localVersion)}</span>
                        </div>
                        <div class="d-dart-update-version-row">
                            <span class="d-dart-update-version-label">${Messages.UPDATE.REQUIRED_VERSION}:</span>
                            <span class="d-dart-update-version-value remote">${escapeHtml(remoteVersion)}</span>
                        </div>
                        ${releaseDate ? `
                            <div class="d-dart-update-version-row">
                                <span class="d-dart-update-version-label">Release Date:</span>
                                <span class="d-dart-update-version-value date">${escapeHtml(releaseDate)}</span>
                            </div>
                        ` : ''}
                    </div>
                    ${releaseNotesHtml}
                    <button class="d-dart-update-button" id="d-dart-update-btn">
                        ${Messages.UPDATE.BUTTON_TEXT}
                    </button>
                    <div class="d-dart-update-instructions">
                        ${Messages.UPDATE.INSTRUCTIONS}
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            currentOverlay = overlay;

            // Add click handler
            const updateBtn = document.getElementById('d-dart-update-btn');
            if (updateBtn) {
                updateBtn.addEventListener('click', handleUpdateClick);
            }

            // Track telemetry
            Telemetry.track(TelemetryEventType.VERSION_CHECK, {
                status: isDowngrade ? 'downgrade_required' : 'update_required',
                localVersion,
                remoteVersion
            });
        };

        /**
         * Show the offline/error blocking modal
         * @param {string} errorMessage
         */
        const showOfflineModal = (errorMessage) => {
            removeOverlay();

            const overlay = document.createElement('div');
            overlay.id = 'd-dart-update-overlay';
            overlay.innerHTML = `
                <div class="d-dart-update-modal offline">
                    <div class="d-dart-update-icon offline">🚫</div>
                    <div class="d-dart-update-title">${Messages.UPDATE.BLOCKED_TITLE}</div>
                    <div class="d-dart-update-body">${Messages.UPDATE.BLOCKED_BODY}</div>
                    <div class="d-dart-update-error-details">
                        <span class="d-dart-update-error-label">Error:</span>
                        <span class="d-dart-update-error-message">${escapeHtml(errorMessage)}</span>
                    </div>
                    <button class="d-dart-update-button retry" id="d-dart-retry-btn">
                        ${Messages.UPDATE.RETRY_BUTTON}
                    </button>
                    <div class="d-dart-update-instructions">
                        Please check your internet connection and try again.
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            currentOverlay = overlay;

            // Add retry handler
            const retryBtn = document.getElementById('d-dart-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', async () => {
                    retryBtn.disabled = true;
                    retryBtn.textContent = '⏳ Retrying...';
                    await sleep(500);
                    window.location.reload();
                });
            }

            // Track telemetry
            Telemetry.track(TelemetryEventType.VERSION_CHECK, {
                status: 'error',
                error: errorMessage
            });
        };

        /**
         * Remove overlay
         */
        const removeOverlay = () => {
            if (currentOverlay) {
                currentOverlay.remove();
                currentOverlay = null;
            }
            // Also try to remove by ID in case reference was lost
            const existing = document.getElementById('d-dart-update-overlay');
            if (existing) {
                existing.remove();
            }
        };

        /**
         * Handle update button click
         */
        const handleUpdateClick = () => {
            // Open the raw script URL - Tampermonkey will intercept and prompt to install
            window.open(CONFIG.UPDATE.SCRIPT_URL, '_blank');
        };

        /**
         * Escape HTML
         * @param {string} text
         * @returns {string}
         */
        const escapeHtml = (text) => {
            if (text == null) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        };

        /**
         * Main version check function
         * @returns {Promise<string>} UpdateStatus
         */
        const check = async () => {
            // Skip if auto-update is disabled
            if (!CONFIG.FEATURES.AUTO_UPDATE) {
                console.log('🚛 D-DART: Auto-update disabled, skipping version check');
                return UpdateStatus.CURRENT;
            }

            console.log(`🚛 D-DART: Starting version check (local: ${CONFIG.VERSION})`);

            // Check cache first
            const cached = getCachedVersion();

            if (cached) {
                console.log(`🚛 D-DART: Using cached version data (remote: ${cached.remoteVersion})`);

                const status = compareVersions(CONFIG.VERSION, cached.remoteVersion);

                if (status === UpdateStatus.CURRENT) {
                    console.log('🚛 D-DART: Version is current (from cache)');
                    Telemetry.track(TelemetryEventType.VERSION_CHECK, {
                        status: 'current',
                        source: 'cache',
                        version: CONFIG.VERSION
                    });
                    return UpdateStatus.CURRENT;
                }

                // Version mismatch - show modal
                showUpdateModal({
                    localVersion: CONFIG.VERSION,
                    remoteVersion: cached.remoteVersion,
                    releaseNotes: cached.releaseNotes,
                    releaseDate: cached.releaseDate,
                    isDowngrade: status === UpdateStatus.DOWNGRADE_REQUIRED
                });

                return status;
            }

            // No valid cache - fetch from GitHub
            showCheckingModal();

            try {
                const remoteData = await fetchRemoteVersion();
                console.log(`🚛 D-DART: Fetched remote version: ${remoteData.version}`);

                // Cache the result
                setCachedVersion(remoteData);

                const status = compareVersions(CONFIG.VERSION, remoteData.version);

                if (status === UpdateStatus.CURRENT) {
                    console.log('🚛 D-DART: Version is current');
                    removeOverlay();
                    Telemetry.track(TelemetryEventType.VERSION_CHECK, {
                        status: 'current',
                        source: 'github',
                        version: CONFIG.VERSION
                    });
                    return UpdateStatus.CURRENT;
                }

                // Version mismatch - show modal
                showUpdateModal({
                    localVersion: CONFIG.VERSION,
                    remoteVersion: remoteData.version,
                    releaseNotes: remoteData.releaseNotes,
                    releaseDate: remoteData.releaseDate,
                    isDowngrade: status === UpdateStatus.DOWNGRADE_REQUIRED
                });

                return status;

            } catch (error) {
                console.error('🚛 D-DART: Version check failed', error);

                if (CONFIG.UPDATE.BLOCK_ON_ERROR) {
                    showOfflineModal(error.message || Messages.ERRORS.GITHUB_UNREACHABLE);
                    return UpdateStatus.ERROR;
                }

                // If not blocking on error, allow usage but log warning
                console.warn('🚛 D-DART: Version check failed but BLOCK_ON_ERROR is false, continuing...');
                removeOverlay();
                return UpdateStatus.CURRENT;
            }
        };

        /**
         * Clear version cache
         */
        const clearCache = () => {
            try {
                GM_setValue(CONFIG.UPDATE.CACHE_KEY, null);
                console.log('🚛 D-DART: Version cache cleared');
            } catch (e) {
                console.error('D-DART: Error clearing version cache', e);
            }
        };

        /**
         * Get current status info
         * @returns {Object}
         */
        const getStatus = () => {
            const cached = getCachedVersion();
            return {
                localVersion: CONFIG.VERSION,
                cachedRemoteVersion: cached?.remoteVersion || null,
                cacheAge: cached ? Date.now() - cached.timestamp : null,
                cacheValid: cached !== null,
                scriptUrl: CONFIG.UPDATE.SCRIPT_URL,
                versionUrl: CONFIG.UPDATE.VERSION_URL
            };
        };

        return {
            check,
            clearCache,
            getStatus,
            compareVersions,
            // Expose for debugging
            _getCachedVersion: getCachedVersion,
            _fetchRemoteVersion: fetchRemoteVersion
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 7: PERFORMANCE MONITOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const PerformanceMonitor = (() => {
        const timings = new Map();
        const metrics = {
            apiCalls: 0,
            apiErrors: 0,
            avgResponseTime: 0,
            totalResponseTime: 0,
            ordersProcessed: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        const startTiming = (label) => {
            timings.set(label, performance.now());
        };

        const endTiming = (label) => {
            const start = timings.get(label);
            if (start) {
                const duration = performance.now() - start;
                timings.delete(label);
                return duration;
            }
            return null;
        };

        const recordApiCall = (duration, isError = false) => {
            metrics.apiCalls++;
            if (isError) {
                metrics.apiErrors++;
            } else {
                metrics.totalResponseTime += duration;
                metrics.avgResponseTime = metrics.totalResponseTime / (metrics.apiCalls - metrics.apiErrors);
            }
        };

        const recordOrderProcessed = () => { metrics.ordersProcessed++; };
        const recordCacheHit = () => { metrics.cacheHits++; };
        const recordCacheMiss = () => { metrics.cacheMisses++; };

        const getMetrics = () => ({
            ...metrics,
            cacheHitRate: metrics.cacheHits + metrics.cacheMisses > 0
                ? (metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) * 100).toFixed(2) + '%'
                : 'N/A',
            apiSuccessRate: metrics.apiCalls > 0
                ? ((metrics.apiCalls - metrics.apiErrors) / metrics.apiCalls * 100).toFixed(2) + '%'
                : 'N/A'
        });

        const reset = () => {
            timings.clear();
            Object.keys(metrics).forEach(key => { metrics[key] = 0; });
        };

        return { startTiming, endTiming, recordApiCall, recordOrderProcessed, recordCacheHit, recordCacheMiss, getMetrics, reset };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 8: STATE MANAGEMENT
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
                undoStack: [],
                lastAction: null,
                _previousResultsContent: ''
            };
            this._listeners = new Map();
            this._stateHistory = [];
            this._maxHistorySize = 50;
        }

        get(key) { return this._state[key]; }

        set(key, value) {
            const oldValue = this._state[key];
            this._state[key] = value;
            this._notify(key, value, oldValue);
        }

        update(updates) {
            const entries = Object.entries(updates);
            for (let i = 0; i < entries.length; i++) {
                const [key, value] = entries[i];
                this.set(key, value);
            }
        }

        subscribe(key, callback) {
            if (!this._listeners.has(key)) {
                this._listeners.set(key, new Set());
            }
            this._listeners.get(key).add(callback);
            return () => {
                const listeners = this._listeners.get(key);
                if (listeners) { listeners.delete(callback); }
            };
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
            const current = this._state.batchReportData;
            this.set('batchReportData', [...current, entry]);
        }

        addPendingApprovalOrder(orderData) {
            const current = this._state.pendingApprovalOrders;
            this.set('pendingApprovalOrders', [...current, orderData]);
        }

        addProcessedOrder(orderId, data) {
            const map = new Map(this._state.processedOrders);
            map.set(orderId, data);
            this.set('processedOrders', map);
        }

        addFailedOrder(orderId, error) {
            const current = this._state.failedOrders;
            this.set('failedOrders', [...current, { orderId, error, timestamp: Date.now() }]);
        }

        toggleShipperExpanded(shipperName) {
            const expanded = new Set(this._state.expandedShippers);
            if (expanded.has(shipperName)) {
                expanded.delete(shipperName);
            } else {
                expanded.add(shipperName);
            }
            this.set('expandedShippers', expanded);
        }

        expandAllShippers(shipperNames) {
            this.set('expandedShippers', new Set(shipperNames));
        }

        collapseAllShippers() {
            this.set('expandedShippers', new Set());
        }

        pushUndo(action) {
            if (!CONFIG.FEATURES.UNDO_ENABLED) return;
            const undoStack = [...this._state.undoStack, action];
            while (undoStack.length > 20) { undoStack.shift(); }
            this.set('undoStack', undoStack);
            this.set('lastAction', action);
        }

        popUndo() {
            if (!CONFIG.FEATURES.UNDO_ENABLED) return null;
            const undoStack = [...this._state.undoStack];
            const action = undoStack.pop();
            this.set('undoStack', undoStack);
            this.set('lastAction', undoStack[undoStack.length - 1] || null);
            return action;
        }

        _notify(key, newValue, oldValue) {
            const listeners = this._listeners.get(key);
            if (listeners) {
                listeners.forEach(callback => {
                    try { callback(newValue, oldValue); }
                    catch (error) { console.error('State listener error', { key, error: error.message }); }
                });
            }
        }

        getSnapshot() {
            return {
                ...this._state,
                processedOrders: Array.from(this._state.processedOrders.entries()),
                processedOrdersCount: this._state.processedOrders.size,
                failedOrdersCount: this._state.failedOrders.length,
                expandedShippers: Array.from(this._state.expandedShippers),
                expandedShippersCount: this._state.expandedShippers.size,
                undoStackSize: this._state.undoStack.length
            };
        }

        clearListeners() { this._listeners.clear(); }

        reset() {
            this._stateHistory = [];
            this.resetBatch();
            this.set('undoStack', []);
            this.set('lastAction', null);
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
     * SECTION 9: LOGGING SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Logger = (() => {
        const logs = [];
        const errorCounts = new Map();

        const addLog = (level, message, data = null) => {
            if (!CONFIG.DEBUG_ENABLED && level === 'DEBUG') return;

            const timestamp = new Date().toISOString();
            let logEntry = `[${timestamp}] [${level}] ${message}`;

            if (data !== null) {
                try {
                    const dataStr = typeof data === 'string' ? data : safeStringify(data);
                    const truncated = dataStr.length > 1000 ? dataStr.substring(0, 1000) + '...[truncated]' : dataStr;
                    logEntry += `\n  DATA: ${truncated}`;
                } catch (e) {
                    logEntry += `\n  DATA: [Could not stringify: ${e.message}]`;
                }
            }

            logs.unshift(logEntry);
            if (logs.length > CONFIG.MAX_DEBUG_LOGS) { logs.pop(); }

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

            generateReport: () => {
                const performanceMetrics = PerformanceMonitor.getMetrics();
                const telemetryMetrics = Telemetry.getMetrics();
                const versionStatus = VersionManager.getStatus();

                return safeStringify({
                    '=== D-DART DEBUG REPORT ===': new Date().toISOString(),
                    'Version': CONFIG.VERSION,
                    'Edition': CONFIG.APP_SUBTITLE,
                    'Page URL': window.location.href,
                    'User Agent': navigator.userAgent,
                    'Is on SMC': Helpers.isOnSMC(),
                    'Token Available': !!TokenManager.getToken(),
                    'Token Age': TokenManager.getAgeString(),
                    'Token Remaining': TokenManager.getRemainingSeconds() + 's',
                    'SOW Status': AppState.get('sowStatus'),
                    'SOW Shipper Count': AppState.get('sowShipperCount'),
                    'Version Check Status': versionStatus,
                    'State Snapshot': AppState.getSnapshot(),
                    'Circuit Breakers': {
                        smc: circuitBreakers.smc.getState(),
                        fmc: circuitBreakers.fmc.getState(),
                        execution: circuitBreakers.execution.getState(),
                        sharepoint: circuitBreakers.sharepoint.getState()
                    },
                    'Performance Metrics': performanceMetrics,
                    'Telemetry Metrics': telemetryMetrics,
                    'Error Frequency': Object.fromEntries(errorCounts),
                    'Health Check': HealthCheck.check(),
                    'Recent Logs': logs.slice(0, 100)
                });
            },

            getLogs: () => [...logs],
            clear: () => { logs.length = 0; errorCounts.clear(); },
            getErrorCounts: () => new Map(errorCounts)
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 10: UTILITY HELPERS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Helpers = {
        escapeHtml(text) {
            if (text == null) return '';
            const div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        },

        generateId(prefix = 'id') {
            return `${prefix}-${Math.random().toString(36).substring(2, 11)}-${Date.now().toString(36)}`;
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

        formatTime(iso, timezone = 'America/Chicago') {
            if (!iso) return null;
            try {
                const date = typeof iso === 'number' ? new Date(iso) : new Date(iso);
                if (isNaN(date.getTime())) return String(iso);
                return date.toLocaleString('en-US', {
                    timeZone: timezone,
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            } catch (e) {
                return String(iso);
            }
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
            else if (ms < 3600000) return `~${Math.ceil(ms / 60000)} minutes`;
            else {
                const hours = Math.floor(ms / 3600000);
                const mins = Math.ceil((ms % 3600000) / 60000);
                return `~${hours}h ${mins}m`;
            }
        },

        formatElapsed(ms) {
            if (ms < 60000) return `${Math.round(ms / 1000)}s`;
            else if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
            else {
                const hours = Math.floor(ms / 3600000);
                const mins = Math.floor((ms % 3600000) / 60000);
                return `${hours}h ${mins}m`;
            }
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

        sanitizeString(str, maxLength = 200) {
            if (!str || typeof str !== 'string') return '';
            return str.trim().substring(0, maxLength);
        },

        async copyToClipboard(text) {
            try {
                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(text);
                    return;
                }
            } catch (e) { /* Fall through */ }

            if (navigator.clipboard?.writeText) {
                return navigator.clipboard.writeText(text);
            }

            return new Promise((resolve, reject) => {
                try {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-9999px';
                    document.body.appendChild(textarea);
                    textarea.select();
                    const success = document.execCommand('copy');
                    document.body.removeChild(textarea);
                    success ? resolve() : reject(new Error(Messages.ERRORS.COPY_FAILED));
                } catch (e) {
                    reject(e);
                }
            });
        },

        getStatusIndicator(status) {
            const indicators = {
                'EARLY': { emoji: '✅', class: 'early' },
                'ON_TIME': { emoji: '✅', class: 'on-time' },
                'LATE': { emoji: '❌', class: 'late' }
            };
            return indicators[status] || { emoji: '❓', class: 'unknown' };
        },

        formatBorrowedIndicator(sourceVrId) {
            if (!sourceVrId) return '';
            const shortVrId = sourceVrId.length > 15 ? sourceVrId.substring(0, 15) + '...' : sourceVrId;
            return `<div class="d-dart-borrowed-indicator">📍 ${this.escapeHtml(shortVrId)}</div>`;
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
            if (value === null || value === undefined || value === '') return '-';
            return String(value);
        },

        formatBoolean(value) {
            if (parseBoolean(value, null) === true) return 'Yes';
            if (parseBoolean(value, null) === false) return 'No';
            return '-';
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 11: URL SECURITY
     * ═══════════════════════════════════════════════════════════════════════════ */

    const SecurityHelpers = {
        sanitizeUrl(url) {
            if (!url) return '#';
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== 'https:') return '#';
                const isAllowed = CONFIG.ALLOWED_DOMAINS.some(domain => parsed.hostname.includes(domain));
                if (!isAllowed) return '#';
                return url;
            } catch (e) {
                return '#';
            }
        },

        buildSMCOrderUrl(orderId) {
            if (!orderId) return '#';
            const url = `${CONFIG.URLS.SMC_ORDER}/${encodeURIComponent(orderId)}`;
            return this.sanitizeUrl(url);
        },

        buildFMCSearchUrl(searchId) {
            if (!searchId) return '#';
            const url = `${CONFIG.URLS.FMC_SEARCH}/${encodeURIComponent(searchId)}`;
            return this.sanitizeUrl(url);
        },

        createSafeLink(url, text, className = '', title = '') {
            const safeUrl = this.sanitizeUrl(url);
            const safeText = Helpers.escapeHtml(text);
            const safeClass = Helpers.escapeHtml(className);
            const safeTitle = Helpers.escapeHtml(title);
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="${safeClass}" title="${safeTitle}">${safeText}</a>`;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 12: VALIDATION SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const Validator = {
        isValidOrderId(id) {
            if (!id || typeof id !== 'string') return false;
            const trimmed = id.trim();
            if (trimmed.length < CONFIG.VALIDATION.ORDER_ID_MIN_LENGTH || trimmed.length > CONFIG.VALIDATION.ORDER_ID_MAX_LENGTH) return false;
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

            for (let i = 0; i < uniqueIds.length; i++) {
                const id = uniqueIds[i];
                if (this.isValidOrderId(id)) {
                    result.sanitized.push(id);
                } else {
                    result.errors.push(`Invalid order ID: ${id}`);
                }
            }

            if (result.sanitized.length === 0) result.valid = false;
            return result;
        },

        isValidAuthNumber(authNumber) {
            if (!authNumber || typeof authNumber !== 'string') return false;
            const trimmed = authNumber.trim();
            return trimmed.length > 0 && trimmed.length <= CONFIG.VALIDATION.AUTH_NUMBER_MAX_LENGTH;
        },

        sanitizeAuthNumber(authNumber) {
            if (!authNumber || typeof authNumber !== 'string') return null;
            const trimmed = authNumber.trim();
            return trimmed.length > 0 ? trimmed.substring(0, CONFIG.VALIDATION.AUTH_NUMBER_MAX_LENGTH) : null;
        },

        isValidShipperName(name) {
            return name && typeof name === 'string' && name.trim().length > 0;
        },

        isValidChargeAmount(amount) {
            return typeof amount === 'number' && !isNaN(amount) && isFinite(amount) && amount >= 0 && amount <= CONFIG.VALIDATION.MAX_CHARGE_AMOUNT;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 13: CACHE MANAGER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const CacheManager = (() => {
        const cache = new Map();
        let cleanupInterval = null;

        const startCleanup = () => {
            if (cleanupInterval) return;
            cleanupInterval = setInterval(() => { cleanup(); }, CONFIG.CACHE.CLEANUP_INTERVAL);
        };

        const stopCleanup = () => {
            if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
        };

        const cleanup = () => {
            const now = Date.now();
            let cleaned = 0;
            for (const [key, value] of cache.entries()) {
                if (now - value.time > CONFIG.CACHE.DURATION) { cache.delete(key); cleaned++; }
            }
            if (cleaned > 0) Logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
        };

        return {
            add(id, data, customDuration = null) {
                if (cache.size >= CONFIG.CACHE.MAX_SIZE) {
                    let oldestKey = null;
                    let oldestTime = Infinity;
                    for (const [key, value] of cache.entries()) {
                        if (value.time < oldestTime) { oldestTime = value.time; oldestKey = key; }
                    }
                    if (oldestKey) cache.delete(oldestKey);
                }
                cache.set(id, { data, time: Date.now(), duration: customDuration || CONFIG.CACHE.DURATION });
                startCleanup();
            },

            get(id) {
                const cached = cache.get(id);
                if (cached) {
                    const duration = cached.duration || CONFIG.CACHE.DURATION;
                    if (Date.now() - cached.time < duration) {
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
                if (cached) {
                    const duration = cached.duration || CONFIG.CACHE.DURATION;
                    return Date.now() - cached.time < duration;
                }
                return false;
            },

            invalidate(id) { cache.delete(id); },
            clear() { cache.clear(); stopCleanup(); },
            getStats() { return { size: cache.size, maxSize: CONFIG.CACHE.MAX_SIZE, keys: Array.from(cache.keys()) }; },
            cleanup() { stopCleanup(); cache.clear(); }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 14: PROGRESS PERSISTENCE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ProgressManager = (() => {
        let saveThrottleTimeout = null;

        return {
            save(data) {
                if (saveThrottleTimeout) return true;
                try {
                    const payload = { ...data, timestamp: Date.now(), version: CONFIG.VERSION, sessionId: Telemetry.getSessionId() };
                    GM_setValue(CONFIG.BATCH.STORAGE_KEY, safeStringify(payload));
                    Logger.debug('Progress saved', { orders: data.processedCount });
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
                    if (Date.now() - data.timestamp > CONFIG.PROGRESS.MAX_AGE) { this.clear(); return null; }
                    if (data.version !== CONFIG.VERSION) { Logger.info('Progress from different version, clearing'); this.clear(); return null; }
                    return data;
                } catch (e) {
                    Logger.warn('Failed to load progress', e.message);
                    return null;
                }
            },

            clear() {
                try {
                    GM_setValue(CONFIG.BATCH.STORAGE_KEY, null);
                    if (saveThrottleTimeout) { clearTimeout(saveThrottleTimeout); saveThrottleTimeout = null; }
                } catch (e) { Logger.warn('Failed to clear progress', e.message); }
            },

            hasProgress() { return this.load() !== null; }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 15: CIRCUIT BREAKER PATTERN
     * ═══════════════════════════════════════════════════════════════════════════ */

    class CircuitBreaker {
        constructor(name) {
            this.name = name;
            this.state = CircuitBreakerState.CLOSED;
            this.failureCount = 0;
            this.successCount = 0;
            this.nextAttemptTime = null;
            this.lastError = null;
            this.lastStateChange = Date.now();
        }

        canExecute() {
            if (this.state === CircuitBreakerState.CLOSED) return true;

            if (this.state === CircuitBreakerState.OPEN) {
                if (Date.now() >= this.nextAttemptTime) {
                    this._setState(CircuitBreakerState.HALF_OPEN);
                    this.successCount = 0;
                    return true;
                }
                throw ErrorHandler.create(ErrorType.CIRCUIT_BREAKER, Messages.ERRORS.CIRCUIT_BREAKER_OPEN, { circuit: this.name, nextAttempt: this.nextAttemptTime });
            }
            return true;
        }

        recordSuccess() {
            this.failureCount = 0;
            this.lastError = null;
            if (this.state === CircuitBreakerState.HALF_OPEN) {
                this.successCount++;
                if (this.successCount >= CONFIG.CIRCUIT_BREAKER.SUCCESS_THRESHOLD) {
                    this._setState(CircuitBreakerState.CLOSED);
                    Logger.info(`Circuit ${this.name} closed after ${this.successCount} successes`);
                }
            }
        }

        recordFailure(error = null) {
            this.failureCount++;
            this.lastError = error;

            if (this.state === CircuitBreakerState.HALF_OPEN) {
                this._setState(CircuitBreakerState.OPEN);
                this.nextAttemptTime = Date.now() + CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT;
                Logger.warn(`Circuit ${this.name} re-opened from half-open`, { failureCount: this.failureCount });
            } else if (this.failureCount >= CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
                this._setState(CircuitBreakerState.OPEN);
                this.nextAttemptTime = Date.now() + CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT;
                Logger.warn(`Circuit ${this.name} opened`, { failureCount: this.failureCount });
            }
        }

        reset() {
            this._setState(CircuitBreakerState.CLOSED);
            this.failureCount = 0;
            this.successCount = 0;
            this.nextAttemptTime = null;
            this.lastError = null;
        }

        getState() {
            return {
                name: this.name,
                state: this.state,
                failureCount: this.failureCount,
                successCount: this.successCount,
                nextAttemptTime: this.nextAttemptTime,
                lastError: this.lastError?.message || null,
                lastStateChange: this.lastStateChange,
                timeSinceStateChange: Date.now() - this.lastStateChange
            };
        }

        _setState(newState) {
            this.state = newState;
            this.lastStateChange = Date.now();
        }
    }

    const circuitBreakers = {
        smc: new CircuitBreaker('SMC'),
        fmc: new CircuitBreaker('FMC'),
        execution: new CircuitBreaker('Execution'),
        sharepoint: new CircuitBreaker('SharePoint')
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 16: REQUEST DEDUPLICATION
     * ═══════════════════════════════════════════════════════════════════════════ */

    const RequestDeduplicator = (() => {
        const pendingRequests = new Map();

        return {
            async execute(key, requestFn) {
                if (pendingRequests.has(key)) {
                    Logger.debug(`Using cached pending request: ${key}`);
                    return pendingRequests.get(key);
                }

                const promise = requestFn()
                    .then(result => { pendingRequests.delete(key); return result; })
                    .catch(error => { pendingRequests.delete(key); throw error; });

                pendingRequests.set(key, promise);
                return promise;
            },

            clear() { pendingRequests.clear(); },
            getPendingCount() { return pendingRequests.size; }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 17: CENTRALIZED ERROR HANDLER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ErrorHandler = {
        create(type, message, context = {}) {
            const error = new Error(message);
            error.type = type;
            error.context = context;
            error.timestamp = Date.now();
            error.id = Helpers.generateId('err');
            return error;
        },

        handle(error, fallback = null, showToast = true) {
            const errorType = error.type || ErrorType.UNKNOWN;
            const context = error.context || {};

            Logger.error(error.message, { type: errorType, context, stack: error.stack, id: error.id });

            if (showToast && typeof UIController !== 'undefined' && UIController.showToast) {
                const userMessage = this._getUserMessage(errorType, error.message);
                UIController.showToast(userMessage, 'error');
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

        boundary(fn, fallback = null) {
            try {
                const result = fn();
                if (result instanceof Promise) {
                    return result.catch(e => { Logger.error('Error boundary caught async error', e.message); return fallback; });
                }
                return result;
            } catch (e) {
                Logger.error('Error boundary caught sync error', e.message);
                return fallback;
            }
        },

        isRateLimitError(error) {
            const msg = error?.message?.toLowerCase() || '';
            return error?.type === ErrorType.RATE_LIMIT || msg.includes('429') || msg.includes('rate') || msg.includes('throttle') || msg.includes('too many');
        },

        isRetryableError(error) {
            return error?.type === ErrorType.NETWORK || error?.type === ErrorType.TIMEOUT || error?.type === ErrorType.RATE_LIMIT || this.isRateLimitError(error);
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
                [ErrorType.STATE]: Messages.ERRORS.INVALID_STATE,
                [ErrorType.UNKNOWN]: Messages.ERRORS.UNKNOWN_ERROR
            };
            return messages[errorType] || messages[ErrorType.UNKNOWN];
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 18: GM REQUEST WRAPPER
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
                    withCredentials: true,
                    anonymous: false,
                    timeout: options.timeout || CONFIG.API.REQUEST_TIMEOUT,
                    onload: (response) => {
                        const duration = performance.now() - startTime;

                        if (response.status >= 200 && response.status < 300) {
                            PerformanceMonitor.recordApiCall(duration, false);
                            let data = response.response;
                            if (typeof data === 'string' && options.responseType === 'json') {
                                try { data = JSON.parse(data); }
                                catch (e) {
                                    PerformanceMonitor.recordApiCall(duration, true);
                                    reject(ErrorHandler.create(ErrorType.PARSE, `JSON parse failed: ${e.message}`, { url: options.url }));
                                    return;
                                }
                            }
                            resolve(data);
                        } else if (response.status === 401 || response.status === 403) {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.AUTH_ERROR, { status: response.status }));
                        } else if (response.status === 404) {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.RESOURCE_NOT_FOUND, { status: 404 }));
                        } else if (response.status === 429) {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.RATE_LIMIT, Messages.ERRORS.RATE_LIMITED, { status: 429 }));
                        } else {
                            PerformanceMonitor.recordApiCall(duration, true);
                            reject(ErrorHandler.create(ErrorType.NETWORK, `HTTP ${response.status}: ${response.statusText}`, { status: response.status }));
                        }
                    },
                    onerror: () => {
                        PerformanceMonitor.recordApiCall(performance.now() - startTime, true);
                        reject(ErrorHandler.create(ErrorType.NETWORK, Messages.ERRORS.NETWORK_ERROR, { url: options.url }));
                    },
                    ontimeout: () => {
                        PerformanceMonitor.recordApiCall(performance.now() - startTime, true);
                        reject(ErrorHandler.create(ErrorType.TIMEOUT, Messages.ERRORS.TIMEOUT_ERROR, { url: options.url }));
                    }
                });
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 19: HTTP CLIENT WITH RETRY
     * ═══════════════════════════════════════════════════════════════════════════ */

    const HttpClient = {
        async request(options, context = 'API call', circuitBreaker = null) {
            if (circuitBreaker) circuitBreaker.canExecute();

            const maxRetries = CONFIG.API.MAX_RETRIES;
            const baseDelay = CONFIG.API.RETRY_BASE_DELAY;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const result = await GMRequest.fetch(options);
                    if (circuitBreaker) circuitBreaker.recordSuccess();
                    return result;
                } catch (error) {
                    if (circuitBreaker) circuitBreaker.recordFailure(error);

                    const isLastAttempt = attempt === maxRetries;
                    const isRetryable = ErrorHandler.isRetryableError(error);

                    if (isLastAttempt || !isRetryable) {
                        Logger.error(`${context}: Failed after ${attempt + 1} attempts`, { error: error.message, type: error.type, context: error.context });
                        throw error;
                    }

                    let delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 200, CONFIG.API.RETRY_MAX_DELAY);

                    if (ErrorHandler.isRateLimitError(error)) {
                        delay *= CONFIG.API.RATE_LIMIT_MULTIPLIER;
                        Logger.warn(`${context}: Rate limited, waiting ${Math.round(delay)}ms...`);
                    } else {
                        Logger.warn(`${context}: Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
                    }

                    await sleep(delay);
                }
            }
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 20: TOKEN MANAGER
     * ═══════════════════════════════════════════════════════════════════════════ */

    const TokenManager = (() => {
        let token = null;
        let tokenTime = 0;
        let isFetching = false;
        let fetchPromise = null;
        let countdownInterval = null;
        let autoRefreshInterval = null;
        let fetchLock = false;

        return {
            init() {
                if (Helpers.isOnSMC()) {
                    const pageToken = this.extractFromPage();
                    if (pageToken) {
                        this.save(pageToken);
                        Logger.info('Token: Extracted from current page');
                        this.startCountdown();
                        return true;
                    }
                }
                const loaded = this.loadFromStorage();
                if (loaded) this.startCountdown();
                return loaded;
            },

            extractFromPage() {
                const selectors = ['meta[name="x-csrf-token"]', 'meta[name="csrf-token"]'];
                for (const selector of selectors) {
                    const meta = document.querySelector(selector);
                    if (meta?.content) return meta.content;
                }
                return null;
            },

            loadFromStorage() {
                try {
                    const saved = GM_getValue(CONFIG.TOKEN.STORAGE_KEY, null);
                    const time = GM_getValue(CONFIG.TOKEN.TIME_KEY, 0);
                    if (saved && time) {
                        token = saved;
                        tokenTime = time;
                        Logger.info('Token: Loaded from storage', { age: this.getAgeString() });
                        return true;
                    }
                } catch (e) { Logger.error('Token: Load error', e.message); }
                return false;
            },

            save(newToken) {
                token = newToken;
                tokenTime = Date.now();
                try {
                    GM_setValue(CONFIG.TOKEN.STORAGE_KEY, token);
                    GM_setValue(CONFIG.TOKEN.TIME_KEY, tokenTime);
                } catch (e) { Logger.error('Token: Save error', e.message); }
            },

            isExpired() {
                if (!token || !tokenTime) return true;
                return (Date.now() - tokenTime) > CONFIG.TOKEN.MAX_AGE;
            },

            getRemainingSeconds() {
                if (!token || !tokenTime) return 0;
                const elapsed = Date.now() - tokenTime;
                const remaining = Math.max(0, CONFIG.TOKEN.MAX_AGE - elapsed);
                return Math.ceil(remaining / 1000);
            },

            getAgeString() {
                if (!tokenTime) return 'N/A';
                const age = Date.now() - tokenTime;
                if (age < 1000) return 'Fresh';
                if (age < 60000) return `${Math.floor(age / 1000)}s`;
                if (age < 3600000) return `${Math.floor(age / 60000)}m ${Math.floor((age % 60000) / 1000)}s`;
                return `${Math.floor(age / 3600000)}h`;
            },

            getStatus() {
                const remainingSeconds = this.getRemainingSeconds();
                if (isFetching) return { status: 'fetching', text: '⏳', class: 'fetching', remainingSeconds: 0 };
                if (!token) return { status: 'missing', text: '❌', class: 'error', remainingSeconds: 0 };
                if (this.isExpired()) return { status: 'expired', text: '❌', class: 'error', remainingSeconds: 0 };
                if (remainingSeconds <= CONFIG.TOKEN.CRITICAL_THRESHOLD) return { status: 'critical', text: `⚠️ ${remainingSeconds}s`, class: 'critical', remainingSeconds };
                if (remainingSeconds <= CONFIG.TOKEN.WARNING_THRESHOLD) return { status: 'warning', text: `✓ ${remainingSeconds}s`, class: 'warning', remainingSeconds };
                return { status: 'ready', text: `✓ ${remainingSeconds}s`, class: 'ready', remainingSeconds };
            },

            getToken() { return token; },

            startCountdown() {
                this.stopCountdown();
                countdownInterval = setInterval(() => {
                    if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();
                }, CONFIG.TOKEN.UPDATE_INTERVAL);
            },

            stopCountdown() {
                if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            },

            startAutoRefresh() {
                this.stopAutoRefresh();
                autoRefreshInterval = setInterval(async () => {
                    const remaining = this.getRemainingSeconds();
                    if (remaining < CONFIG.TOKEN.WARNING_THRESHOLD) {
                        Logger.info('Token: Auto-refreshing...');
                        await this.ensure();
                    }
                }, CONFIG.TOKEN.REFRESH_INTERVAL);
                Logger.debug('Token: Auto-refresh started');
            },

            stopAutoRefresh() {
                if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; Logger.debug('Token: Auto-refresh stopped'); }
            },

            async ensure() {
                if (Helpers.isOnSMC()) {
                    const pageToken = this.extractFromPage();
                    if (pageToken) { this.save(pageToken); this.startCountdown(); Logger.debug('Token: Refreshed from page'); return true; }
                }

                if (token && !this.isExpired()) { Logger.debug('Token: Valid, no refresh needed'); return true; }

                if (fetchLock) {
                    if (fetchPromise) { Logger.debug('Token: Waiting for existing fetch...'); return await fetchPromise; }
                    return false;
                }

                fetchLock = true;
                isFetching = true;
                Logger.info('Token: Fetching from SMC...');
                fetchPromise = this._doFetch();

                try { return await fetchPromise; }
                finally { isFetching = false; fetchLock = false; fetchPromise = null; }
            },

            _doFetch() {
                return new Promise((resolve) => {
                    if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: CONFIG.URLS.SMC_BASE,
                        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
                        withCredentials: true,
                        timeout: CONFIG.TOKEN.FETCH_TIMEOUT,
                        onload: (response) => {
                            Logger.debug('Token fetch response', { status: response.status });

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
                                    this.save(foundToken);
                                    this.startCountdown();
                                    Logger.info('Token: Fetched successfully');
                                    Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: true });
                                    if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();
                                    resolve(true);
                                } else {
                                    Logger.warn('Token: Not found in response');
                                    Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: false, reason: 'not_found' });
                                    if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();
                                    resolve(false);
                                }
                            } else {
                                Logger.warn('Token fetch failed', { status: response.status });
                                Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: false, status: response.status });
                                if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();
                                resolve(false);
                            }
                        },
                        onerror: (error) => {
                            Logger.error('Token: Network error', error);
                            Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: false, reason: 'network_error' });
                            if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();
                            resolve(false);
                        },
                        ontimeout: () => {
                            Logger.error('Token: Timeout');
                            Telemetry.track(TelemetryEventType.TOKEN_REFRESH, { success: false, reason: 'timeout' });
                            if (typeof UIController !== 'undefined' && UIController.updateTokenIndicator) UIController.updateTokenIndicator();
                            resolve(false);
                        }
                    });
                });
            },

            clear() {
                token = null;
                tokenTime = 0;
                this.stopCountdown();
                this.stopAutoRefresh();
                try { GM_setValue(CONFIG.TOKEN.STORAGE_KEY, null); GM_setValue(CONFIG.TOKEN.TIME_KEY, 0); }
                catch (e) { Logger.error('Token: Clear error', e.message); }
            },

            cleanup() { this.stopCountdown(); this.stopAutoRefresh(); }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 21: SOW CONFIG MANAGER
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
                if (field === 'Rate') {
                    const numVal = parseFloat(value);
                    if (isNaN(numVal) || numVal < 0) errors.push(`${field}: Must be a positive number`);
                }
                if (field === 'RateUnit') {
                    const normalized = String(value).toUpperCase();
                    if (!['HOUR', 'MINUTE'].includes(normalized)) errors.push(`${field}: Must be "Hour" or "Minute", got "${value}"`);
                }
                if (field === 'MaxCharge') {
                    const numVal = parseFloat(value);
                    if (isNaN(numVal) || numVal < 0) errors.push(`${field}: Must be a positive number`);
                }
                if (field.includes('FreeTime')) {
                    const numVal = parseFloat(value);
                    if (isNaN(numVal) || numVal < 0) errors.push(`${field}: Must be a non-negative number`);
                }
                if (field.includes('Eligible')) {
                    const boolVal = parseBoolean(value, null);
                    if (boolVal === null) errors.push(`${field}: Must be Yes or No`);
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
            Logger.info(`SOW: Parsing ${items.length} shipper configurations`);

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
                    rawData: {
                        Title: item.Title, Rate: item.Rate, RateUnit: item.RateUnit, MaxCharge: item.MaxCharge,
                        BillingIncrement: item.BillingIncrement, RoundingRule: item.RoundingRule, RoundDownMaxMinutes: item.RoundDownMaxMinutes,
                        RequiresApproval: item.RequiresApproval, AutoChargeAllowed: item.AutoChargeAllowed, AuthNumberRequired: item.AuthNumberRequired,
                        IsActive: item.IsActive, Notes: item.Notes,
                        PU_Live_Eligible: item.PU_Live_Eligible, PU_Live_FreeTime: item.PU_Live_FreeTime,
                        PU_DropHook_Eligible: item.PU_DropHook_Eligible, PU_DropHook_FreeTime: item.PU_DropHook_FreeTime,
                        DO_Live_Eligible: item.DO_Live_Eligible, DO_Live_FreeTime: item.DO_Live_FreeTime,
                        DO_DropHook_Eligible: item.DO_DropHook_Eligible, DO_DropHook_FreeTime: item.DO_DropHook_FreeTime
                    }
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
                            billingIncrement: item.BillingIncrement ? `${item.BillingIncrement} min` : '-',
                            puLiveFreeTime: `${item.PU_Live_FreeTime} min`,
                            puDropHookFreeTime: `${item.PU_DropHook_FreeTime} min`,
                            doLiveFreeTime: `${item.DO_Live_FreeTime} min`,
                            doDropHookFreeTime: `${item.DO_DropHook_FreeTime} min`
                        }
                    };

                    validMap.set(shipperName, config);
                    Logger.debug(`SOW: ✓ Loaded "${shipperName}"`, { status });
                } else {
                    Logger.warn(`SOW: ✗ Validation failed for "${shipperName}"`, { errors: validation.errors });
                }
            }

            return { validMap, allShippers };
        };

        return {
            async init() { return this.fetch(); },

            async fetch() {
                if (isLoading && loadingPromise) {
                    Logger.debug('SOW: Already loading, waiting for existing request');
                    return loadingPromise;
                }

                isLoading = true;
                AppState.set('sowStatus', SOWStatus.LOADING);
                if (typeof UIController !== 'undefined' && UIController.updateSOWIndicator) UIController.updateSOWIndicator();

                Logger.info('SOW: Fetching configuration from SharePoint...');
                loadingPromise = this._doFetch();

                try { return await loadingPromise; }
                finally { isLoading = false; loadingPromise = null; }
            },

            async _doFetch() {
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

                    AppState.update({ sowStatus: SOWStatus.LOADED, sowShipperCount: configMap.size, sowLastError: null, sowLastRefresh: lastFetchTime });

                    Logger.info(`SOW: ✓ Successfully loaded ${configMap.size} valid shipper configurations (${allShippers.length} total)`);
                    Telemetry.track(TelemetryEventType.SOW_LOAD, { success: true, validCount: configMap.size, totalCount: allShippers.length });

                    if (typeof UIController !== 'undefined') {
                        UIController.updateSOWIndicator();
                        UIController.showToast(Messages.SUCCESS.SOW_LOADED(configMap.size), 'success');
                    }

                    return true;
                } catch (error) {
                    Logger.error('SOW: Failed to fetch configuration', error.message);

                    let status = SOWStatus.ERROR;
                    let errorMessage = Messages.ERRORS.SOW_SERVER_UNREACHABLE;

                    if (error.type === ErrorType.AUTH || error.message?.includes('401') || error.message?.includes('403')) {
                        status = SOWStatus.AUTH_REQUIRED;
                        errorMessage = Messages.ERRORS.SOW_AUTH_REQUIRED;
                    }

                    AppState.update({ sowStatus: status, sowShipperCount: 0, sowLastError: errorMessage });
                    Telemetry.track(TelemetryEventType.SOW_LOAD, { success: false, error: error.message });

                    if (typeof UIController !== 'undefined') {
                        UIController.updateSOWIndicator();
                        UIController.showToast(errorMessage, 'error');
                    }

                    return false;
                }
            },

            getConfig(shipperName) {
                if (!shipperName) { Logger.warn('SOW: getConfig called with empty shipper name'); return null; }
                const config = configMap.get(shipperName);
                if (!config) Logger.warn(`SOW: No configuration found for "${shipperName}"`);
                return config;
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

            getShipperNames() { return Array.from(configMap.keys()); },
            getAllConfigs() { return Array.from(configMap.values()); },
            getAllShippersData() { return [...allShippersData]; },

            getStatistics() {
                const stats = { total: allShippersData.length, active: 0, inactive: 0, validationErrors: 0, hourlyRate: 0, minuteRate: 0 };

                for (const shipper of allShippersData) {
                    if (shipper.status === ShipperStatus.ACTIVE) {
                        stats.active++;
                        const rateUnit = String(shipper.rawData.RateUnit || '').toUpperCase();
                        if (rateUnit === 'MINUTE') stats.minuteRate++;
                        else stats.hourlyRate++;
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

                if (searchTerm && searchTerm.trim() !== '') {
                    const term = searchTerm.trim();
                    if (CONFIG.FEATURES.FUZZY_SEARCH) {
                        filtered = filtered.filter(s => fuzzyMatch(term, s.shipperName));
                    } else {
                        const termLower = term.toLowerCase();
                        filtered = filtered.filter(s => s.shipperName.toLowerCase().includes(termLower));
                    }
                }

                if (filters.status !== 'all') {
                    if (filters.status === 'active') filtered = filtered.filter(s => s.status === ShipperStatus.ACTIVE);
                    else if (filters.status === 'inactive') filtered = filtered.filter(s => s.status === ShipperStatus.INACTIVE);
                    else if (filters.status === 'error') filtered = filtered.filter(s => s.status === ShipperStatus.VALIDATION_ERROR);
                }

                if (filters.rateType !== 'all') {
                    filtered = filtered.filter(s => {
                        const rateUnit = String(s.rawData.RateUnit || '').toUpperCase();
                        if (filters.rateType === 'hour') return rateUnit === 'HOUR' || rateUnit === '';
                        else if (filters.rateType === 'minute') return rateUnit === 'MINUTE';
                        return true;
                    });
                }

                if (filters.validation !== 'all') {
                    if (filters.validation === 'valid') filtered = filtered.filter(s => s.status !== ShipperStatus.VALIDATION_ERROR);
                    else if (filters.validation === 'invalid') filtered = filtered.filter(s => s.status === ShipperStatus.VALIDATION_ERROR);
                }

                if (filters.hideInactive) filtered = filtered.filter(s => s.status !== ShipperStatus.INACTIVE);

                return filtered;
            },

            isLoaded() { return AppState.get('sowStatus') === SOWStatus.LOADED && configMap.size > 0; },
            getShipperCount() { return configMap.size; },
            getLastRefreshTime() { return lastFetchTime; },

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
     * SECTION 22: DATA HELPERS
     * ═══════════════════════════════════════════════════════════════════════════ */

    const DataHelpers = {
        formatStatusDisplay(statusCode) {
            if (!statusCode) return { display: 'Unknown', color: '#888888', group: 'unknown' };
            if (OrderStatusMap[statusCode]) return OrderStatusMap[statusCode];

            const upperStatus = statusCode.toUpperCase();
            let group = 'active';
            let color = '#f0ad4e';
            if (upperStatus.includes('CANCEL') || upperStatus.includes('REJECT')) { group = 'cancelled'; color = '#d9534f'; }
            else if (upperStatus.includes('PAID')) { group = 'paid'; color = '#5cb85c'; }
            else if (upperStatus.includes('INVOICE') || upperStatus === 'PENDING_PAYMENT') { group = 'invoiced'; color = '#5cb85c'; }

            const display = statusCode.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
            return { display, color, group };
        },

        formatLoadType(loadingType) {
            if (!loadingType) return { display: 'Unknown', icon: '📦', isDropHook: false, key: 'LIVE' };
            const upper = loadingType.toUpperCase();
            const isDropHook = upper.includes('DROP') || upper.includes('HOOK');
            return { display: isDropHook ? 'Drop Hook' : 'Live', icon: isDropHook ? '🪝' : '🔄', isDropHook, key: isDropHook ? 'DROP_HOOK' : 'LIVE' };
        },

        formatStopType(stopActionType) {
            if (!stopActionType) return { display: 'Unknown', label: 'STOP', class: 'pickup', isPickup: false, key: 'DROP_OFF' };
            const upper = stopActionType.toUpperCase();
            const isPickup = upper.includes('PICKUP') || upper === 'PICK_UP';
            return { display: isPickup ? 'Pickup' : 'Drop Off', label: isPickup ? 'SHIPPER' : 'RECEIVER', class: isPickup ? 'pickup' : 'dropoff', isPickup, key: isPickup ? 'PICKUP' : 'DROP_OFF' };
        },

        findDetentionHolds(pricing) {
            const result = { shipper: false, receiver: false, shipperCode: null, receiverCode: null, shipperItem: null, receiverItem: null, shipperAmount: 0, receiverAmount: 0, shipperExists: false, receiverExists: false };
            if (!Array.isArray(pricing)) return result;

            const DRIVER_DETENTION_SHIPPER = 'DETENTION_DRIVER_AT_SHIPPER';
            const DRIVER_DETENTION_RECEIVER = 'DETENTION_DRIVER_AT_RECEIVER';

            for (let i = 0; i < pricing.length; i++) {
                const item = pricing[i];
                const code = String(item.pricingCode || '').toUpperCase();
                const value = item.price?.value || 0;

                if (code === DRIVER_DETENTION_SHIPPER) {
                    result.shipperCode = item.pricingCode;
                    result.shipperItem = item;
                    result.shipperAmount = value;
                    result.shipperExists = true;
                    if (value === 0) result.shipper = true;
                }

                if (code === DRIVER_DETENTION_RECEIVER) {
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
            if (!planned || !actual) return { minutes: null, text: 'Pending', class: 'pending', label: '', status: 'UNKNOWN' };

            try {
                const plannedDate = typeof planned === 'number' ? planned : new Date(planned).getTime();
                const actualDate = typeof actual === 'number' ? actual : new Date(actual).getTime();

                if (isNaN(plannedDate) || isNaN(actualDate)) return { minutes: null, text: 'Invalid', class: 'pending', label: '', status: 'UNKNOWN' };

                const plannedMinutes = Math.floor(plannedDate / 60000) * 60000;
                const actualMinutes = Math.floor(actualDate / 60000) * 60000;
                const diffMinutes = Math.round((actualMinutes - plannedMinutes) / 60000);

                let status;
                if (diffMinutes <= CONFIG.TIMING.EARLY_MINUTES) status = 'EARLY';
                else if (diffMinutes <= CONFIG.TIMING.ON_TIME_MINUTES) status = 'ON_TIME';
                else status = 'LATE';

                if (diffMinutes > 0) return { minutes: diffMinutes, text: Helpers.formatDuration(diffMinutes), class: 'late', label: 'LATE', status };
                if (diffMinutes < 0) return { minutes: diffMinutes, text: Helpers.formatDuration(Math.abs(diffMinutes)), class: 'early', label: 'EARLY', status };
                return { minutes: 0, text: 'ON TIME', class: 'on-time', label: '', status: 'ON_TIME' };
            } catch (e) {
                Logger.warn('calculateTimeDiff error', e.message);
                return { minutes: null, text: 'Error', class: 'pending', label: '', status: 'UNKNOWN' };
            }
        },

        getDetentionPricingConfig(isPickup) {
            return isPickup ? DetentionPricing.SHIPPER : DetentionPricing.RECEIVER;
        },

        getActionDisplayText(analysis) {
            if (!analysis) return Messages.INFO.NO_ACTION_NEEDED;

            if (analysis.processed) {
                switch (analysis.processedAction) {
                    case 'updated': return `$${analysis.processedAmount.toFixed(2)} (Charge Added)`;
                    case 'created': return `$${analysis.processedAmount.toFixed(2)} (Recovered)`;
                    case 'released': return '$0 (Hold Released)';
                    case 'hold_created': return `$0 Hold Created ($${analysis.charge.toFixed(2)} chargeable)`;
                    case 'skipped': return 'Skipped';
                    case 'timeout': return 'Timeout';
                    case 'analysis_only': return `$${analysis.charge.toFixed(2)} (Analysis Only)`;
                    default: return Messages.INFO.NO_ACTION_NEEDED;
                }
            }

            switch (analysis.type) {
                case ResultType.CHARGEABLE:
                case ResultType.CHARGEABLE_MAX:
                    if (analysis.action === ActionType.ANALYSIS_ONLY) return `$${analysis.charge.toFixed(2)} (Analysis Only - Hold Exists)`;
                    if (analysis.action === ActionType.CREATE_HOLD_ONLY) return `$${analysis.charge.toFixed(2)} (Will Create $0 Hold)`;
                    return `$${analysis.charge.toFixed(2)} (Chargeable)`;
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
                case ResultType.SOW_INCOMPLETE: return 'SOW Incomplete';
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
                const lines = analysis.breakdown.split('\n');
                lines.forEach(line => { if (line.trim()) details.push(`• ${line.trim()}`); });
            }

            if (analysis.processed) {
                switch (analysis.processedAction) {
                    case 'updated': details.push(`• Action: Hold updated to $${analysis.processedAmount.toFixed(2)}`); break;
                    case 'created': details.push(`• Action: New charge created $${analysis.processedAmount.toFixed(2)}`); break;
                    case 'released': details.push('• Action: Hold released ($0)'); break;
                    case 'hold_created': details.push('• Action: $0 hold created for manual review'); break;
                    case 'analysis_only': details.push('• Action: Analysis only (no auto-charge)'); break;
                }
            } else if (analysis.action === ActionType.RELEASE_HOLD) {
                details.push('• Action: Will release hold');
            } else if (analysis.action === ActionType.ADD_CHARGE_UPDATE || analysis.action === ActionType.ADD_CHARGE_CREATE) {
                details.push(`• Action: Will add charge $${analysis.charge.toFixed(2)}`);
            } else if (analysis.action === ActionType.CREATE_HOLD_ONLY) {
                details.push('• Action: Will create $0 hold for manual review');
            } else if (analysis.action === ActionType.ANALYSIS_ONLY) {
                details.push('• Action: Analysis only (auto-charge disabled)');
            } else if (analysis.type === ResultType.NO_HOLD_NO_CHARGE || analysis.type === ResultType.WITHIN_FREE_TIME) {
                details.push('• No charge applicable');
            }

            return details;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 23: FMC API SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const FMCApiService = {
        async fetchSMCExecution(orderId) {
            const url = `${CONFIG.URLS.SMC_EXECUTION_API}/operator-user-shipment?orderId=${encodeURIComponent(orderId)}`;
            Logger.debug(`FMC API: Fetching SMC execution for ${orderId}`);

            const data = await HttpClient.request({
                method: 'GET', url, headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
            }, 'SMC Execution', circuitBreakers.execution);

            return this._parseSMCExecutionResponse(data);
        },

        _parseSMCExecutionResponse(data) {
            if (!data) throw ErrorHandler.create(ErrorType.PARSE, Messages.ERRORS.EMPTY_RESPONSE, { source: 'SMC' });
            if (!data.executionLegs || data.executionLegs.length === 0) throw ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.NO_EXECUTION_LEGS, { data });

            const leg = data.executionLegs[0];
            if (!leg?.tourId) throw ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.NO_TOUR_ID, { leg });

            return {
                orderId: data.orderId, shipmentId: data.shipmentId, shipmentStatus: data.shipmentStatus, shipperId: data.shipperId, freightType: data.freightType,
                tourId: leg.tourId, vehicleRunId: leg.vehicleRunId, carrierId: leg.carrierId, executionStatus: leg.status, transportMode: leg.transportMode,
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
                contractedLane: `${leg.from?.facility?.ncsNodeCode || ''}->${leg.to?.facility?.ncsNodeCode || ''}`,
                alerts: data.alerts || []
            };
        },

        async fetchFMCByTourId(tourId) {
            const url = `${CONFIG.URLS.FMC_BASE}/fmc/search/execution/by-id`;
            const requestBody = {
                searchIds: [tourId], searchByIds: true, page: 0, pageSize: 50,
                sortOrder: [{ field: "first_dock_arrival_time", dir: "asc" }],
                bookmarkedSavedSearch: false, executionViewModePreference: "vrs"
            };

            Logger.debug(`FMC API: Fetching FMC data for Tour ${tourId}`);

            const data = await HttpClient.request({
                method: 'POST', url, headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }, 'FMC Data', circuitBreakers.fmc);

            if (!data?.success) throw ErrorHandler.create(ErrorType.BUSINESS, data?.errorMessage || Messages.ERRORS.FMC_API_FAILURE, { tourId });

            Logger.debug('FMC API: FMC data received', { recordCount: data.returnedObject?.records?.length || 0 });
            return data.returnedObject;
        },

        findMatchingVR(fmcRecords, contractedLane) {
            if (!fmcRecords || fmcRecords.length === 0 || !contractedLane) return null;

            const [originCode, destCode] = contractedLane.split('->');
            Logger.debug(`FMC API: Finding VR for lane ${contractedLane}`);

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
                if (match) {
                    Logger.debug('FMC API: Found matching VR', { vrId: match.vehicleRunId, lane: match.simpleFacilityLane });
                    return match;
                }
            }

            if (fmcRecords.length > 0) {
                Logger.warn('FMC API: No exact lane match found, using first VR');
                return fmcRecords[0];
            }

            return null;
        },

        extractTimestamps(vrRecord) {
            if (!vrRecord?.aggregatedStops || vrRecord.aggregatedStops.length === 0) {
                Logger.warn('FMC API: No stops available for timestamp extraction');
                return null;
            }

            const stops = vrRecord.aggregatedStops;
            const originStop = stops.find(s => !s?.lastStop) || stops[0];
            const destStop = stops.find(s => s?.lastStop) || stops[stops.length - 1];

            if (!originStop || !destStop) {
                Logger.warn('FMC API: Could not determine origin/destination stops');
                return null;
            }

            const getActionTimestamps = (stop) => {
                if (!stop?.actions?.length) {
                    return {
                        plannedYardArrival: null, plannedYardDeparture: null, actualYardArrival: null, actualYardDeparture: null,
                        arrivalSource: null, departureSource: null, arrivalDelayReason: null, departureDelayReason: null,
                        actualYardArrivalSourceVrId: null, actualYardDepartureSourceVrId: null
                    };
                }

                const action = stop.actions[0];
                return {
                    plannedYardArrival: action?.plannedYardArrivalTime, plannedYardDeparture: action?.plannedYardDepartureTime,
                    actualYardArrival: action?.actualYardArrivalTime, actualYardDeparture: action?.actualYardDepartureTime,
                    arrivalSource: action?.actualYardArrivalTimeSource, departureSource: action?.actualYardDepartureTimeSource,
                    arrivalDelayReason: action?.arrivalDelayReason, departureDelayReason: action?.departureDelayReason,
                    actualYardArrivalSourceVrId: null, actualYardDepartureSourceVrId: null
                };
            };

            return {
                origin: {
                    stopCode: originStop?.stopCode || 'Unknown', displayName: originStop?.displayName || originStop?.stopCode || 'Unknown',
                    timezone: originStop?.timezone || 'America/Los_Angeles', status: originStop?.status,
                    actionType: originStop?.actions?.[0]?.type || 'PICKUP', timestamps: getActionTimestamps(originStop)
                },
                destination: {
                    stopCode: destStop?.stopCode || 'Unknown', displayName: destStop?.displayName || destStop?.stopCode || 'Unknown',
                    timezone: destStop?.timezone || 'America/Los_Angeles', status: destStop?.status,
                    actionType: destStop?.actions?.[0]?.type || 'DROPOFF', timestamps: getActionTimestamps(destStop)
                },
                vrMetadata: {
                    vehicleRunId: vrRecord?.vehicleRunId, tourId: vrRecord?.tourId, executionStatus: vrRecord?.executionStatus,
                    hasDelays: vrRecord?.hasDelays, carrierName: vrRecord?.carrierName, totalDistance: vrRecord?.totalDistance
                }
            };
        },

        fillMissingTimestampsFromTour(timestamps, allRecords, currentVrId) {
            if (!timestamps || !allRecords || allRecords.length === 0) return timestamps;

            const findTimestampFromOtherVRs = (stopCode, missingFields) => {
                const borrowedData = {};

                for (const vr of allRecords) {
                    if (vr?.vehicleRunId === currentVrId) continue;
                    if (!vr?.aggregatedStops) continue;

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

            if (timestamps.origin?.stopCode) {
                const originMissing = [];
                if (!timestamps.origin.timestamps?.actualYardArrival) originMissing.push('actualYardArrivalTime');
                if (!timestamps.origin.timestamps?.actualYardDeparture) originMissing.push('actualYardDepartureTime');

                if (originMissing.length > 0) {
                    const borrowedOrigin = findTimestampFromOtherVRs(timestamps.origin.stopCode, originMissing);
                    if (borrowedOrigin.actualYardArrivalTime && timestamps.origin.timestamps) {
                        timestamps.origin.timestamps.actualYardArrival = borrowedOrigin.actualYardArrivalTime.value;
                        timestamps.origin.timestamps.actualYardArrivalSourceVrId = borrowedOrigin.actualYardArrivalTime.sourceVrId;
                    }
                    if (borrowedOrigin.actualYardDepartureTime && timestamps.origin.timestamps) {
                        timestamps.origin.timestamps.actualYardDeparture = borrowedOrigin.actualYardDepartureTime.value;
                        timestamps.origin.timestamps.actualYardDepartureSourceVrId = borrowedOrigin.actualYardDepartureTime.sourceVrId;
                    }
                }
            }

            if (timestamps.destination?.stopCode) {
                const destMissing = [];
                if (!timestamps.destination.timestamps?.actualYardArrival) destMissing.push('actualYardArrivalTime');
                if (!timestamps.destination.timestamps?.actualYardDeparture) destMissing.push('actualYardDepartureTime');

                if (destMissing.length > 0) {
                    const borrowedDest = findTimestampFromOtherVRs(timestamps.destination.stopCode, destMissing);
                    if (borrowedDest.actualYardArrivalTime && timestamps.destination.timestamps) {
                        timestamps.destination.timestamps.actualYardArrival = borrowedDest.actualYardArrivalTime.value;
                        timestamps.destination.timestamps.actualYardArrivalSourceVrId = borrowedDest.actualYardArrivalTime.sourceVrId;
                    }
                    if (borrowedDest.actualYardDepartureTime && timestamps.destination.timestamps) {
                        timestamps.destination.timestamps.actualYardDeparture = borrowedDest.actualYardDepartureTime.value;
                        timestamps.destination.timestamps.actualYardDepartureSourceVrId = borrowedDest.actualYardDepartureTime.sourceVrId;
                    }
                }
            }

            return timestamps;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 24: SMC API SERVICE
     * ═══════════════════════════════════════════════════════════════════════════ */

    const SMCApiService = {
        async fetchOrderView(orderId) {
            Logger.debug(`SMC API: Fetching order view ${orderId}`);
            return await GMRequest.fetch({
                method: 'GET',
                url: `${CONFIG.URLS.SMC_BASE}/shipper/order/view/${encodeURIComponent(orderId)}`,
                headers: { 'Accept': 'application/json' },
                timeout: CONFIG.API.REQUEST_TIMEOUT
            });
        },

        async fetchOrderFull(orderId) {
            Logger.debug(`SMC API: Fetching full order ${orderId}`);
            return await GMRequest.fetch({
                method: 'GET',
                url: `${CONFIG.URLS.SMC_BASE}/shipper/order/${encodeURIComponent(orderId)}`,
                headers: { 'Accept': 'application/json' },
                timeout: CONFIG.API.REQUEST_TIMEOUT
            });
        },

        async updateOrder(orderData, newPricing) {
            const token = TokenManager.getToken();
            if (!token) throw ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_MISSING, { action: 'updateOrder' });

            const orderId = orderData?.orderId?.id;
            if (!orderId) throw ErrorHandler.create(ErrorType.VALIDATION, 'Order ID is required for update', { orderData });

            Logger.debug(`SMC API: Updating order ${orderId}`);

            const payload = {
                orderId: orderData.orderId,
                orderDetails: { ...orderData.orderDetails, shipperPricing: { ...orderData.orderDetails?.shipperPricing, pricing: newPricing } },
                vrId: orderData.vrId, tpId: orderData.tpId, auditDetails: orderData.auditDetails, orderStatus: orderData.orderStatus,
                invoiceStatus: orderData.invoiceStatus, executionStatus: orderData.executionStatus, executionSourceType: orderData.executionSourceType,
                orderCreationSource: orderData.orderCreationSource, invoiceNumbers: orderData.invoiceNumbers || [], invoiceDetails: orderData.invoiceDetails,
                requiresManualPlanChanges: orderData.requiresManualPlanChanges, orderAction: orderData.orderAction,
                orderExecutionItineraryVersion: orderData.orderExecutionItineraryVersion, shipmentList: orderData.shipmentList,
                tenderDecision: orderData.tenderDecision, businessIdentifier: orderData.businessIdentifier,
                validationFailureReasonCodes: orderData.validationFailureReasonCodes || [], tasks: []
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${CONFIG.URLS.SMC_BASE}/shipper/order/update`,
                    headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'x-csrf-token': token },
                    data: JSON.stringify(payload),
                    withCredentials: true,
                    timeout: CONFIG.API.REQUEST_TIMEOUT,
                    onload: (response) => {
                        Logger.debug(`SMC API: Update response ${response.status}`);
                        if (response.status === 200) resolve(true);
                        else if (response.status === 403) { TokenManager.clear(); reject(ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_EXPIRED, { orderId })); }
                        else if (response.status === 409 || response.responseText?.includes('version')) reject(ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.VERSION_CONFLICT, { orderId }));
                        else if (response.status === 429) reject(ErrorHandler.create(ErrorType.RATE_LIMIT, Messages.ERRORS.RATE_LIMITED, { orderId }));
                        else {
                            let errorMsg = `HTTP ${response.status}`;
                            try { const errorData = JSON.parse(response.responseText); errorMsg = errorData.message || errorData.error || errorMsg; } catch (e) { }
                            reject(ErrorHandler.create(ErrorType.NETWORK, errorMsg, { orderId, status: response.status }));
                        }
                    },
                    onerror: () => reject(ErrorHandler.create(ErrorType.NETWORK, Messages.ERRORS.NETWORK_ERROR, { orderId })),
                    ontimeout: () => reject(ErrorHandler.create(ErrorType.TIMEOUT, Messages.ERRORS.TIMEOUT_ERROR, { orderId }))
                });
            });
        },

        async addPricingLine(orderId, orderVersion, pricingConfig, chargeAmount) {
            const token = TokenManager.getToken();
            if (!token) throw ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_MISSING, { action: 'addPricingLine' });

            Logger.debug(`SMC API: Adding pricing line to ${orderId}`, { pricingCode: pricingConfig.pricingCode, amount: chargeAmount });

            const payload = {
                pricingComponents: [{
                    price: { value: chargeAmount, unit: 'USD' }, reasonCode: 'ORIGINAL', pricingCode: pricingConfig.pricingCode,
                    pricingId: null, pricingComponentId: null, audit: null, invoiceNumber: null, chargeStatus: null, invoiceNote: null,
                    authorizationNumber: null, chargeDocuments: [], taxComponents: [], itemized: [],
                    description: pricingConfig.description, type: 'ACCESSORIAL'
                }],
                orderId: { id: orderId, version: orderVersion }
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${CONFIG.URLS.SMC_BASE}/shipper/order/add-shipper-pricing`,
                    headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'x-csrf-token': token },
                    data: JSON.stringify(payload),
                    withCredentials: true,
                    timeout: CONFIG.API.REQUEST_TIMEOUT,
                    onload: (response) => {
                        Logger.debug(`SMC API: Add pricing response ${response.status}`);
                        if (response.status === 200) resolve(true);
                        else if (response.status === 403) { TokenManager.clear(); reject(ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_EXPIRED, { orderId })); }
                        else if (response.status === 409 || response.responseText?.includes('version')) reject(ErrorHandler.create(ErrorType.BUSINESS, Messages.ERRORS.VERSION_CONFLICT, { orderId }));
                        else if (response.status === 429) reject(ErrorHandler.create(ErrorType.RATE_LIMIT, Messages.ERRORS.RATE_LIMITED, { orderId }));
                        else {
                            let errorMsg = `HTTP ${response.status}`;
                            try { const errorData = JSON.parse(response.responseText); errorMsg = errorData.message || errorData.error || errorMsg; } catch (e) { }
                            reject(ErrorHandler.create(ErrorType.NETWORK, errorMsg, { orderId, status: response.status }));
                        }
                    },
                    onerror: () => reject(ErrorHandler.create(ErrorType.NETWORK, Messages.ERRORS.NETWORK_ERROR, { orderId })),
                    ontimeout: () => reject(ErrorHandler.create(ErrorType.TIMEOUT, Messages.ERRORS.TIMEOUT_ERROR, { orderId }))
                });
            });
        },

        async addComment(orderId, comment) {
            const token = TokenManager.getToken();
            if (!token || !comment) { Logger.warn('addComment: Missing token or comment', { orderId, hasToken: !!token, hasComment: !!comment }); return false; }

            Logger.debug(`SMC API: Adding comment to ${orderId}`);

            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${CONFIG.URLS.SMC_BASE}/shipper/order/comments/add`,
                    headers: { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'x-csrf-token': token },
                    data: JSON.stringify({ orderId, comment }),
                    withCredentials: true,
                    timeout: CONFIG.TOKEN.FETCH_TIMEOUT,
                    onload: (response) => {
                        Logger.debug(`SMC API: Comment response ${response.status}`);
                        if (response.status !== 200) Logger.warn('addComment failed', { orderId, status: response.status });
                        resolve(response.status === 200);
                    },
                    onerror: (error) => { Logger.warn('addComment network error', { orderId, error }); resolve(false); },
                    ontimeout: () => { Logger.warn('addComment timeout', { orderId }); resolve(false); }
                });
            });
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 25: DETENTION ANALYZER
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
                type: null, charge: 0, breakdown: '', hitMax: false, action: ActionType.NO_ACTION, actionText: '', comment: '',
                hasHold, holdCode, detentionExists, existingAmount, isPickup, fmcTimestamps,
                requiresApproval: sowConfig?.requiresApproval || false, autoChargeAllowed: sowConfig?.autoChargeAllowed || false,
                authNumberRequired: sowConfig?.authNumberRequired || false, sowConfig,
                processed: false, processedAction: null, processedAmount: null, processError: null
            };

            const statusInfo = DataHelpers.formatStatusDisplay(orderStatus);

            if (statusInfo.group === 'cancelled') return this._setResult(result, ResultType.ORDER_CANCELLED, 'Order was cancelled/rejected', ActionType.NO_ACTION, 'Order cancelled');
            if (statusInfo.group === 'invoiced' || statusInfo.group === 'paid') return this._setResult(result, ResultType.ORDER_INVOICED, 'Order already invoiced', ActionType.NO_ACTION, 'Already invoiced');

            if (existingAmount > 0) {
                result.type = ResultType.CHARGE_EXISTS;
                result.charge = existingAmount;
                result.breakdown = `Detention charge already exists: $${existingAmount.toFixed(2)}\nNo modifications will be made.`;
                result.action = ActionType.NO_ACTION;
                result.actionText = `Charge already added ($${existingAmount.toFixed(2)})`;
                return result;
            }

            if (!fmcTimestamps?.timestamps) return this._setResult(result, ResultType.FMC_DATA_UNAVAILABLE, 'FMC timestamp data not available for this stop', ActionType.PENDING, 'FMC data unavailable');

            const ts = fmcTimestamps.timestamps;

            if (!ts.actualYardArrival) return this._setResult(result, ResultType.MISSING_ARRIVAL, 'Driver has not arrived yet (FMC)', ActionType.PENDING, Messages.INFO.AWAITING_ARRIVAL);
            if (!ts.actualYardDeparture) return this._setResult(result, ResultType.MISSING_DEPARTURE, 'Driver has arrived but not departed yet (FMC)', ActionType.PENDING, Messages.INFO.AWAITING_DEPARTURE);

            const stopKey = stopTypeInfo.key;
            const loadKey = loadTypeInfo.key;

            const rules = sowConfig?.rules?.[stopKey]?.[loadKey];
            if (!rules) return this._setResult(result, ResultType.UNKNOWN_ERROR, `No rules found for ${stopKey}/${loadKey}`, ActionType.ERROR, 'SOW rule missing');

            if (!rules.eligible) {
                result.type = ResultType.NO_DETENTION_DROP_HOOK;
                result.breakdown = `${loadTypeInfo.display} - Not eligible for detention per SOW`;
                if (hasHold) { result.action = ActionType.RELEASE_HOLD; result.actionText = 'Release hold (Not eligible)'; result.comment = Messages.COMMENTS.RELEASE_HOLD; }
                else { result.action = ActionType.NO_ACTION; result.actionText = 'No detention (Not eligible)'; }
                return result;
            }

            const plannedArrival = ts.plannedYardArrival;
            const actualArrival = ts.actualYardArrival;
            const arrivalDiff = DataHelpers.calculateTimeDiff(plannedArrival, actualArrival);

            if (arrivalDiff.minutes !== null && arrivalDiff.minutes > CONFIG.TIMING.LATE_MINUTES) {
                result.type = ResultType.DRIVER_LATE;
                result.breakdown = `Driver arrived ${Helpers.formatDuration(arrivalDiff.minutes)} late (FMC)\nNot eligible for detention`;
                if (hasHold) { result.action = ActionType.RELEASE_HOLD; result.actionText = 'Release hold (Late)'; result.comment = Messages.COMMENTS.RELEASE_HOLD; }
                else { result.action = ActionType.NO_ACTION; result.actionText = Messages.INFO.DRIVER_LATE; }
                return result;
            }

            const plannedDeparture = ts.plannedYardDeparture;
            const actualDeparture = ts.actualYardDeparture;
            const departureDiff = DataHelpers.calculateTimeDiff(plannedDeparture, actualDeparture);
            const delayMinutes = (departureDiff.minutes !== null && departureDiff.minutes > 0) ? departureDiff.minutes : 0;

            return this._calculateCharge(result, sowConfig, rules, delayMinutes, hasHold);
        },

        _setResult(result, type, breakdown, action, actionText) {
            result.type = type; result.breakdown = breakdown; result.action = action; result.actionText = actionText;
            return result;
        },

        _calculateCharge(result, sowConfig, rules, delayMinutes, hasHold) {
            const freeTime = rules.freeTime || 0;
            let chargeableMinutes = delayMinutes - freeTime;

            if (chargeableMinutes <= 0) {
                result.type = ResultType.WITHIN_FREE_TIME;
                result.breakdown = `Delay: ${delayMinutes} min (FMC)\nFree Time: ${freeTime} min\nNo charge`;
                if (hasHold) { result.action = ActionType.RELEASE_HOLD; result.actionText = 'Release hold ($0)'; result.comment = Messages.COMMENTS.RELEASE_HOLD; }
                else { result.type = ResultType.NO_HOLD_NO_CHARGE; result.action = ActionType.NO_ACTION; result.actionText = Messages.INFO.NO_ACTION_NEEDED; }
                return result;
            }

            if (sowConfig.roundDownMaxMinutes && sowConfig.roundDownMaxMinutes > 0) {
                if (chargeableMinutes < sowConfig.roundDownMaxMinutes) {
                    result.type = ResultType.BELOW_MINIMUM_THRESHOLD;
                    result.breakdown = [`Delay: ${delayMinutes} min (FMC)`, `Free Time: -${freeTime} min`, `Chargeable: ${chargeableMinutes} min`, `Minimum Threshold: ${sowConfig.roundDownMaxMinutes} min`, `Below threshold - No charge`].join('\n');
                    if (hasHold) { result.action = ActionType.RELEASE_HOLD; result.actionText = 'Release hold (Below min)'; result.comment = Messages.COMMENTS.RELEASE_HOLD; }
                    else { result.action = ActionType.NO_ACTION; result.actionText = Messages.INFO.BELOW_MINIMUM; }
                    return result;
                }
            }

            const originalChargeableMinutes = chargeableMinutes;
            let wasRounded = false;

            if (sowConfig.billingIncrement && sowConfig.billingIncrement > 0 && sowConfig.roundingRule && sowConfig.roundingRule !== '') {
                chargeableMinutes = this._applyBillingIncrement(chargeableMinutes, sowConfig.billingIncrement, sowConfig.roundingRule);
                wasRounded = (chargeableMinutes !== originalChargeableMinutes);
            }

            let charge;
            if (sowConfig.rateUnit === 'MINUTE') charge = chargeableMinutes * sowConfig.rate;
            else charge = (chargeableMinutes / 60) * sowConfig.rate;

            charge = Math.round(charge * 100) / 100;

            const hitMax = charge >= sowConfig.maxCharge;
            charge = Math.min(charge, sowConfig.maxCharge);

            result.charge = charge;
            result.hitMax = hitMax;

            const breakdownLines = [`Delay: ${delayMinutes} min (FMC)`, `Free Time: -${freeTime} min`, `Chargeable: ${originalChargeableMinutes} min`];
            if (wasRounded) { breakdownLines.push(`Billing Increment: ${sowConfig.billingIncrement} min (${sowConfig.roundingRule})`); breakdownLines.push(`Rounded to: ${chargeableMinutes} min`); }
            if (sowConfig.rateUnit === 'MINUTE') breakdownLines.push(`Rate: $${sowConfig.rate}/min`);
            else breakdownLines.push(`Rate: $${sowConfig.rate}/hr`);
            breakdownLines.push(`Charge: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`);
            result.breakdown = breakdownLines.join('\n');

            return this._determineAction(result, charge, hasHold, hitMax, sowConfig);
        },

        _applyBillingIncrement(minutes, increment, roundingRule) {
            if (!increment || increment <= 0) return minutes;

            const remainder = minutes % increment;
            if (remainder === 0) return minutes;

            const normalizedRule = String(roundingRule || '').toUpperCase();

            switch (normalizedRule) {
                case 'UP': return minutes + (increment - remainder);
                case 'DOWN': return minutes - remainder;
                case 'NEAREST': {
                    const halfIncrement = increment / 2;
                    if (remainder >= halfIncrement) return minutes + (increment - remainder);
                    else return minutes - remainder;
                }
                default: Logger.warn(`Unknown rounding rule: ${roundingRule}, defaulting to UP`); return minutes + (increment - remainder);
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

            result.type = hitMax ? ResultType.CHARGEABLE_MAX : ResultType.CHARGEABLE;

            if (requiresApproval) {
                result.action = ActionType.PENDING_APPROVAL;
                result.actionText = `Approval needed: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''}`;
                return result;
            }

            if (hasHold) {
                result.action = ActionType.ANALYSIS_ONLY;
                result.actionText = `Analysis only: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''} (Hold exists)`;
            } else {
                result.action = ActionType.CREATE_HOLD_ONLY;
                result.actionText = `Create $0 hold: $${charge.toFixed(2)}${hitMax ? ' (MAX)' : ''} chargeable`;
            }
            return result;
        },

        previewCharge(params) {
            const { delayMinutes, freeTime, rate, rateUnit, maxCharge, billingIncrement, roundingRule, roundDownMaxMinutes } = params;

            let chargeableMinutes = delayMinutes - (freeTime || 0);

            if (chargeableMinutes <= 0) return { charge: 0, chargeableMinutes: 0, withinFreeTime: true };
            if (roundDownMaxMinutes && chargeableMinutes < roundDownMaxMinutes) return { charge: 0, chargeableMinutes, belowMinimum: true };

            const originalMinutes = chargeableMinutes;

            if (billingIncrement && billingIncrement > 0 && roundingRule) {
                chargeableMinutes = this._applyBillingIncrement(chargeableMinutes, billingIncrement, roundingRule);
            }

            let charge;
            if (rateUnit === 'MINUTE') charge = chargeableMinutes * rate;
            else charge = (chargeableMinutes / 60) * rate;

            charge = Math.round(charge * 100) / 100;
            const hitMax = charge >= maxCharge;
            charge = Math.min(charge, maxCharge);

            return { charge, chargeableMinutes, originalMinutes, wasRounded: chargeableMinutes !== originalMinutes, hitMax };
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 26: HTML GENERATOR
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
                case ShipperStatus.ACTIVE: return 'status-active';
                case ShipperStatus.INACTIVE: return 'status-inactive';
                case ShipperStatus.VALIDATION_ERROR: return 'status-error';
                default: return '';
            }
        },

        renderShipperCard(shipper, isExpanded) {
            const statusIcon = HTMLGenerator.getStatusIcon(shipper.status);
            const statusClass = HTMLGenerator.getStatusClass(shipper.status);
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
                            <button class="d-dart-expand-btn" aria-label="${isExpanded ? 'Collapse' : 'Expand'} details">${isExpanded ? '▲' : '▼'}</button>
                        </div>
                    </div>
                    <div class="d-dart-shipper-details ${isExpanded ? 'expanded' : ''}" id="d-dart-details-${safeId}">
                        ${shipper.status === ShipperStatus.VALIDATION_ERROR ? `
                            <div class="d-dart-validation-errors">
                                <div class="d-dart-error-title">❌ Validation Errors:</div>
                                <ul class="d-dart-error-list">${shipper.validationErrors.map(err => `<li>${Helpers.escapeHtml(err)}</li>`).join('')}</ul>
                            </div>
                        ` : ''}
                        <div class="d-dart-details-grid">
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📌 BASIC INFORMATION</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Name:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.Title)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Rate:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.Rate)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">RateUnit:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.RateUnit)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">MaxCharge:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.MaxCharge ? `$${data.MaxCharge}` : null)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">IsActive:</span><span class="d-dart-details-value ${parseBoolean(data.IsActive, true) ? 'yes' : 'no'}">${Helpers.formatBoolean(data.IsActive)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 PICKUP + LIVE</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.PU_Live_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">FreeTime:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.PU_Live_FreeTime != null ? `${data.PU_Live_FreeTime} min` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 PICKUP + DROP HOOK</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.PU_DropHook_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">FreeTime:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.PU_DropHook_FreeTime != null ? `${data.PU_DropHook_FreeTime} min` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 DROP OFF + LIVE</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.DO_Live_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">FreeTime:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.DO_Live_FreeTime != null ? `${data.DO_Live_FreeTime} min` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">📍 DROP OFF + DROP HOOK</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Eligible:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.DO_DropHook_Eligible)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">FreeTime:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.DO_DropHook_FreeTime != null ? `${data.DO_DropHook_FreeTime} min` : null)}</span></div>
                            </div>
                            <div class="d-dart-details-section">
                                <div class="d-dart-details-title">⚙️ OPTIONAL SETTINGS</div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">BillingIncrement:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.BillingIncrement ? `${data.BillingIncrement} min` : null)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">RoundingRule:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.RoundingRule)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">RoundDownMaxMinutes:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.RoundDownMaxMinutes ? `${data.RoundDownMaxMinutes} min` : null)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">RequiresApproval:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.RequiresApproval)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">AutoChargeAllowed:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.AutoChargeAllowed)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">AuthNumberRequired:</span><span class="d-dart-details-value">${Helpers.formatBoolean(data.AuthNumberRequired)}</span></div>
                                <div class="d-dart-details-row"><span class="d-dart-details-label">Notes:</span><span class="d-dart-details-value">${Helpers.formatValueOrDash(data.Notes)}</span></div>
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

            if (shippers.length === 0) return '<div class="d-dart-no-results">No shippers match your filters</div>';
            return shippers.map(shipper => HTMLGenerator.renderShipperCard(shipper, expandedShippers.has(shipper.shipperName))).join('');
        },

        settingsPanelInline() {
            const stats = SOWConfigManager.getStatistics();
            const lastRefresh = SOWConfigManager.getLastRefreshTime();
            const filters = AppState.get('settingsFilters');
            const searchTerm = AppState.get('settingsSearchTerm');

            return `
                <div class="d-dart-settings-inline" id="d-dart-settings-inline">
                    <div class="d-dart-settings-inline-header">
                        <button class="d-dart-back-btn" id="d-dart-settings-back" aria-label="Back to main view">← Back</button>
                        <span class="d-dart-settings-inline-title">⚙️ SOW SETTINGS</span>
                    </div>
                    <div class="d-dart-settings-section">
                        <div class="d-dart-settings-section-title">📊 SUMMARY STATISTICS</div>
                        <div class="d-dart-stats-grid">
                            <div class="d-dart-stat-box"><span class="d-dart-stat-value" id="d-dart-stats-total">${stats.total}</span><span class="d-dart-stat-label">Total</span></div>
                            <div class="d-dart-stat-box active"><span class="d-dart-stat-value" id="d-dart-stats-active">${stats.active}</span><span class="d-dart-stat-label">✅ Active</span></div>
                            <div class="d-dart-stat-box inactive"><span class="d-dart-stat-value" id="d-dart-stats-inactive">${stats.inactive}</span><span class="d-dart-stat-label">⏸️ Inactive</span></div>
                            <div class="d-dart-stat-box error"><span class="d-dart-stat-value" id="d-dart-stats-errors">${stats.validationErrors}</span><span class="d-dart-stat-label">❌ Errors</span></div>
                        </div>
                        <div class="d-dart-last-refresh" id="d-dart-last-refresh">🕐 Last Refresh: ${Helpers.formatRelativeTime(lastRefresh)}</div>
                    </div>
                    <div class="d-dart-settings-actions">
                        <button class="d-dart-action-btn" id="d-dart-refresh-sow">🔄 Refresh SOW</button>
                        <button class="d-dart-action-btn" id="d-dart-expand-all">⬇️ Expand All</button>
                        <button class="d-dart-action-btn" id="d-dart-collapse-all">⬆️ Collapse All</button>
                    </div>
                    <div class="d-dart-settings-section">
                        <div class="d-dart-settings-section-title">🔍 SEARCH & FILTERS</div>
                        <div class="d-dart-search-box">
                            <input type="text" class="d-dart-search-input" id="d-dart-shipper-search" placeholder="Search shipper name..." value="${Helpers.escapeHtml(searchTerm || '')}" autocomplete="off" aria-label="Search shippers">
                            <span class="d-dart-search-icon" aria-hidden="true">🔍</span>
                        </div>
                        <div class="d-dart-filters-grid">
                            <div class="d-dart-filter-group">
                                <label class="d-dart-filter-label" for="d-dart-filter-status">Status:</label>
                                <select class="d-dart-filter-select" id="d-dart-filter-status">
                                    <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All</option>
                                    <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
                                    <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                                    <option value="error" ${filters.status === 'error' ? 'selected' : ''}>Error</option>
                                </select>
                            </div>
                            <div class="d-dart-filter-group">
                                <label class="d-dart-filter-label" for="d-dart-filter-rate">Rate:</label>
                                <select class="d-dart-filter-select" id="d-dart-filter-rate">
                                    <option value="all" ${filters.rateType === 'all' ? 'selected' : ''}>All</option>
                                    <option value="hour" ${filters.rateType === 'hour' ? 'selected' : ''}>Hourly</option>
                                    <option value="minute" ${filters.rateType === 'minute' ? 'selected' : ''}>Per Minute</option>
                                </select>
                            </div>
                            <div class="d-dart-filter-group">
                                <label class="d-dart-filter-label" for="d-dart-filter-validation">Validation:</label>
                                <select class="d-dart-filter-select" id="d-dart-filter-validation">
                                    <option value="all" ${filters.validation === 'all' ? 'selected' : ''}>All</option>
                                    <option value="valid" ${filters.validation === 'valid' ? 'selected' : ''}>Valid</option>
                                    <option value="invalid" ${filters.validation === 'invalid' ? 'selected' : ''}>Invalid</option>
                                </select>
                            </div>
                        </div>
                        <label class="d-dart-checkbox-label">
                            <input type="checkbox" id="d-dart-hide-inactive" ${filters.hideInactive ? 'checked' : ''}>
                            Hide Inactive Shippers
                        </label>
                    </div>
                    <div class="d-dart-settings-section">
                        <div class="d-dart-settings-section-title" id="d-dart-shippers-count">📋 SHIPPERS (${stats.total})</div>
                        <div class="d-dart-shippers-list" id="d-dart-shippers-list">${HTMLGenerator.renderShippersList()}</div>
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
                    case 'hold_created': return 'hold-created';
                    case 'analysis_only': return 'analysis-only';
                    default: return 'no-action';
                }
            }

            switch (analysis.type) {
                case ResultType.CHARGEABLE:
                case ResultType.CHARGEABLE_MAX:
                    if (analysis.action === ActionType.ANALYSIS_ONLY) return 'analysis-only';
                    if (analysis.action === ActionType.CREATE_HOLD_ONLY) return 'hold-created';
                    return 'chargeable';
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

            const toggleId = Helpers.generateId('detention-details');

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
                        <button class="d-dart-banner-toggle" data-toggle-target="${toggleId}" aria-expanded="false" aria-controls="${toggleId}">▼ Details</button>
                    </div>
                    <div class="d-dart-banner-summary">
                        <div class="d-dart-banner-row">
                            <span class="d-dart-banner-label">SHIPPER:</span>
                            <span class="d-dart-banner-value ${HTMLGenerator.getBannerValueClass(shipperAnalysis)}">${Helpers.escapeHtml(shipperText)}</span>
                        </div>
                        <div class="d-dart-banner-row">
                            <span class="d-dart-banner-label">RECEIVER:</span>
                            <span class="d-dart-banner-value ${HTMLGenerator.getBannerValueClass(receiverAnalysis)}">${Helpers.escapeHtml(receiverText)}</span>
                        </div>
                    </div>
                    <div class="d-dart-banner-details" id="${toggleId}" aria-hidden="true">
                        <div class="d-dart-breakdown-section">
                            <div class="d-dart-breakdown-title">SHIPPER BREAKDOWN:</div>
                            <div class="d-dart-breakdown-content">${shipperBreakdown.map(line => `<div class="d-dart-breakdown-line">${Helpers.escapeHtml(line)}</div>`).join('')}</div>
                        </div>
                        <div class="d-dart-breakdown-section">
                            <div class="d-dart-breakdown-title">RECEIVER BREAKDOWN:</div>
                            <div class="d-dart-breakdown-content">${receiverBreakdown.map(line => `<div class="d-dart-breakdown-line">${Helpers.escapeHtml(line)}</div>`).join('')}</div>
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
            if (sowConfig.autoChargeAllowed) items.push({ label: '⚡ Auto:', value: 'Enabled', class: 'success' });
            else items.push({ label: '⚡ Auto:', value: 'Disabled', class: 'disabled' });

            const itemsHtml = items.map(item => `
                <div class="d-dart-sow-item">
                    <span class="d-dart-sow-item-label">${item.label}</span>
                    <span class="d-dart-sow-item-value ${item.class || ''}">${Helpers.escapeHtml(item.value)}</span>
                </div>
            `).join('');

            return `<div class="d-dart-sow-details" id="${toggleId}" aria-hidden="true"><div class="d-dart-sow-flex">${itemsHtml}</div></div>`;
        },

        shipperCard(orderData) {
            const shipperName = orderData?.shipperName || 'Unknown Shipper';
            const truncatedName = Helpers.truncateText(shipperName, 25);
            const sowConfig = orderData?.sowConfig;
            const orderStatus = orderData?.viewData?.orderExecutionStatus || 'UNKNOWN';
            const statusInfo = DataHelpers.formatStatusDisplay(orderStatus);

            const orderId = orderData?.orderId || 'Unknown';
            const vrId = orderData?.viewData?.vehicleRunIds?.[0] || orderData?.viewData?.vrId || orderData?.smcExecutionData?.vehicleRunId || 'N/A';
            const tourId = orderData?.smcExecutionData?.tourId || 'N/A';

            const smcUrl = SecurityHelpers.buildSMCOrderUrl(orderId);
            const fmcVrUrl = SecurityHelpers.buildFMCSearchUrl(vrId);
            const fmcTourUrl = SecurityHelpers.buildFMCSearchUrl(tourId);

            const originCode = orderData?.smcExecutionData?.origin?.nodeCode || orderData?.fmcTimestamps?.origin?.stopCode || 'Unknown';
            const destCode = orderData?.smcExecutionData?.destination?.nodeCode || orderData?.fmcTimestamps?.destination?.stopCode || 'Unknown';

            const pricing = orderData?.viewData?.shipperPricing?.pricing || [];
            const holds = DataHelpers.findDetentionHolds(pricing);

            const sowToggleId = Helpers.generateId('sow');

            return `
                <div class="d-dart-shipper-card">
                    <div class="d-dart-header-row">
                        <div class="d-dart-shipper-name" title="${Helpers.escapeHtml(shipperName)}">🏢 ${Helpers.escapeHtml(truncatedName)}</div>
                        <div class="d-dart-header-badges">
                            <span class="d-dart-status-badge" style="background-color:${Helpers.escapeHtml(statusInfo.color)}">${Helpers.escapeHtml(statusInfo.display)}</span>
                            ${sowConfig ? `<span class="d-dart-sow-badge" data-toggle-target="${sowToggleId}" role="button" tabindex="0" aria-expanded="false" aria-controls="${sowToggleId}">SOW▼</span>` : '<span class="d-dart-sow-badge error">No SOW</span>'}
                        </div>
                    </div>
                    ${sowConfig ? HTMLGenerator.sowDetails(sowConfig, sowToggleId) : ''}
                    <div class="d-dart-id-row">
                        <a href="${smcUrl}" target="_blank" rel="noopener noreferrer" class="d-dart-id-item" title="Click to open in SMC">
                            <div class="d-dart-id-content"><span class="d-dart-id-label">Order ID</span><span class="d-dart-id-value"><span class="d-dart-id-icon" aria-hidden="true">📋</span>${Helpers.escapeHtml(orderId)}</span></div>
                        </a>
                        <a href="${fmcVrUrl}" target="_blank" rel="noopener noreferrer" class="d-dart-id-item" title="Click to open in FMC">
                            <div class="d-dart-id-content"><span class="d-dart-id-label">VR ID</span><span class="d-dart-id-value"><span class="d-dart-id-icon" aria-hidden="true">🚛</span>${Helpers.escapeHtml(vrId)}</span></div>
                        </a>
                        <a href="${fmcTourUrl}" target="_blank" rel="noopener noreferrer" class="d-dart-id-item" title="Click to open in FMC">
                            <div class="d-dart-id-content"><span class="d-dart-id-label">Tour ID</span><span class="d-dart-id-value"><span class="d-dart-id-icon" aria-hidden="true">🔗</span>${Helpers.escapeHtml(tourId)}</span></div>
                        </a>
                    </div>
                    <div class="d-dart-lane-row">
                        <span class="d-dart-lane-origin">📍 ${Helpers.escapeHtml(originCode)}</span>
                        <div class="d-dart-lane-arrow-container"><div class="d-dart-lane-arrow-track"><span class="d-dart-arrow-static" aria-hidden="true">────►────</span><span class="d-dart-arrow-moving" aria-hidden="true">→</span></div></div>
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
                arrival: { planned: '-', actual: '-', delay: null, delayClass: 'pending', borrowedVrId: null },
                departure: { planned: '-', actual: '-', delay: null, delayClass: 'pending', borrowedVrId: null }
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
                    result.arrival.delayClass = diff.minutes > 0 ? 'late' : 'early';
                }
            }

            if (ts.plannedYardDeparture) result.departure.planned = Helpers.formatTimeFromEpoch(ts.plannedYardDeparture, timezone);
            if (ts.actualYardDeparture) {
                result.departure.actual = Helpers.formatTimeFromEpoch(ts.actualYardDeparture, timezone);
                result.departure.borrowedVrId = ts.actualYardDepartureSourceVrId;
                if (ts.plannedYardDeparture) {
                    const diff = DataHelpers.calculateTimeDiff(ts.plannedYardDeparture, ts.actualYardDeparture);
                    result.departure.delay = diff.minutes;
                    result.departure.delayClass = diff.minutes > 0 ? 'late' : 'early';
                }
            }

            return result;
        },

        timestampBox(label, data) {
            let delayText = '-';
            if (data.delay !== null) {
                const absMinutes = Math.abs(data.delay);
                if (absMinutes >= 60) { const hours = Math.floor(absMinutes / 60); const mins = absMinutes % 60; delayText = `${hours}h ${mins}m`; }
                else delayText = `${absMinutes}m`;
            }

            let delayLabel = '-';
            if (data.delay !== null) {
                if (data.delay < 0) delayLabel = 'EARLY';
                else if (data.delay > 0) delayLabel = 'DELAY';
                else delayLabel = 'ON TIME';
            }

            const borrowedHtml = data.borrowedVrId ? Helpers.formatBorrowedIndicator(data.borrowedVrId) : '';

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
            else if (smcExecutionData) {
                timezone = stopTypeInfo.isPickup ? smcExecutionData.origin?.timezone : smcExecutionData.destination?.timezone;
                timezone = timezone || 'America/Chicago';
            }

            const stopName = stop?.stopName || analysis?.stopName || `Stop ${(analysis?.stopIndex || 0) + 1}`;
            const fmcTimestamps = HTMLGenerator.getStopTimestamps(analysis, timezone);

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
                        ${HTMLGenerator.timestampBox('Arrival', fmcTimestamps.arrival)}
                        ${HTMLGenerator.timestampBox('Departure', fmcTimestamps.departure)}
                    </div>
                </div>
            `;
        },

        batchReportTable(data) {
            if (!data || data.length === 0) return '<div class="d-dart-empty">No results to display</div>';

            const stats = {
                recovered: data.filter(d => d.action === ActionDisplayConfig.RECOVERED.reportTerm).length,
                chargesAdded: data.filter(d => d.action === ActionDisplayConfig.CHARGE_ADDED.reportTerm).length,
                holdsReleased: data.filter(d => d.action === ActionDisplayConfig.HOLD_RELEASED.reportTerm).length,
                holdsCreated: data.filter(d => d.action === ActionDisplayConfig.HOLD_CREATED.reportTerm).length,
                analysisOnly: data.filter(d => d.action === ActionDisplayConfig.ANALYSIS_ONLY.reportTerm).length,
                pending: data.filter(d => d.action === ActionDisplayConfig.PENDING.reportTerm).length,
                errors: data.filter(d => d.status === 'Error').length
            };

            const rowsHtml = data.map(row => {
                let statusClass = '';
                if (row.status === 'Completed') statusClass = 'success';
                else if (row.status === 'Pending') statusClass = 'pending';
                else if (row.status === 'Error') statusClass = 'error';
                else if (row.status === 'Info') statusClass = 'analysis';

                let actionClass = '';
                if (row.action === ActionDisplayConfig.RECOVERED.reportTerm) actionClass = 'recovered';
                if (row.action === ActionDisplayConfig.ANALYSIS_ONLY.reportTerm) actionClass = 'analysis';
                if (row.action === ActionDisplayConfig.HOLD_CREATED.reportTerm) actionClass = 'hold-created';

                return `
                    <tr class="${statusClass} ${actionClass}">
                        <td class="d-dart-order-cell">${Helpers.escapeHtml(row.orderId)}</td>
                        <td>${Helpers.escapeHtml(Helpers.truncateText(row.shipper, 15))}</td>
                        <td>${Helpers.escapeHtml(row.action)}</td>
                        <td>${Helpers.escapeHtml(row.amount)}</td>
                        <td><span class="d-dart-status-badge ${statusClass}">${Helpers.escapeHtml(row.status)}</span></td>
                    </tr>
                `;
            }).join('');

            return `
                <div class="d-dart-batch-summary">
                    <div class="d-dart-batch-stat recovered">🎯 ${stats.recovered} Rec</div>
                    <div class="d-dart-batch-stat success">✅ ${stats.chargesAdded} Add</div>
                    <div class="d-dart-batch-stat released">✅ ${stats.holdsReleased} Rel</div>
                    <div class="d-dart-batch-stat hold-created">📋 ${stats.holdsCreated} Hold</div>
                    <div class="d-dart-batch-stat analysis">📊 ${stats.analysisOnly} Info</div>
                    <div class="d-dart-batch-stat pending">⏳ ${stats.pending} Pend</div>
                    <div class="d-dart-batch-stat error">❌ ${stats.errors} Err</div>
                </div>
                <div class="d-dart-batch-table-container">
                    <table class="d-dart-batch-table">
                        <thead><tr><th>Order ID</th><th>Shipper</th><th>Action</th><th>Amount</th><th>Status</th></tr></thead>
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
                        <div class="d-dart-progress-title">🔄 Enterprise Batch Processing</div>
                        <div class="d-dart-progress-controls">
                            <button class="d-dart-control-btn pause" id="d-dart-pause-btn" title="Pause" aria-label="Pause processing">⏸️</button>
                            <button class="d-dart-control-btn resume" id="d-dart-resume-btn" title="Resume" style="display:none" aria-label="Resume processing">▶️</button>
                            <button class="d-dart-control-btn cancel" id="d-dart-cancel-btn" title="Cancel" aria-label="Cancel processing">⏹️</button>
                        </div>
                    </div>
                    <div class="d-dart-progress-stats">
                        <div class="d-dart-stat"><span class="d-dart-stat-value" id="d-dart-stat-processed">0</span><span class="d-dart-stat-label">Processed</span></div>
                        <div class="d-dart-stat success"><span class="d-dart-stat-value" id="d-dart-stat-success">0</span><span class="d-dart-stat-label">Success</span></div>
                        <div class="d-dart-stat error"><span class="d-dart-stat-value" id="d-dart-stat-failed">0</span><span class="d-dart-stat-label">Failed</span></div>
                        <div class="d-dart-stat"><span class="d-dart-stat-value" id="d-dart-stat-remaining">${totalOrders}</span><span class="d-dart-stat-label">Remaining</span></div>
                    </div>
                    <div class="d-dart-progress-bar-container"><div class="d-dart-progress-bar" id="d-dart-progress-bar" style="width: 0%" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div></div>
                    <div class="d-dart-progress-info">
                        <div class="d-dart-progress-status" id="d-dart-progress-status" aria-live="polite">Initializing...</div>
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
                    <div class="d-dart-sow-error-icon" aria-hidden="true">${isAuthError ? '🔐' : '❌'}</div>
                    <div class="d-dart-sow-error-title">${isAuthError ? 'SharePoint Login Required' : 'SOW Server Unavailable'}</div>
                    <div class="d-dart-sow-error-message">${Helpers.escapeHtml(errorMessage)}</div>
                    ${isAuthError ? `
                        <div class="d-dart-sow-error-instructions">
                            <p>1. Click the button below to open SharePoint</p>
                            <p>2. Login with your credentials</p>
                            <p>3. Come back and click "Retry"</p>
                        </div>
                        <a href="${CONFIG.SHAREPOINT.SITE_URL}" target="_blank" rel="noopener noreferrer" class="d-dart-sow-login-btn">🔗 Open SharePoint</a>
                    ` : ''}
                    <button class="d-dart-sow-retry-btn" id="d-dart-sow-retry">🔄 Retry</button>
                </div>
            `;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 27: REPORT GENERATOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ReportGenerator = {
        generateCSV(data) {
            const headers = ['Order ID', 'Shipper', 'Action', 'Amount', 'Status', 'Notes'];
            const rows = data.map(row => [
                row.orderId,
                `"${String(row.shipper || '').replace(/"/g, '""')}"`,
                row.action, row.amount, row.status,
                `"${String(row.notes || '').replace(/"/g, '""')}"`
            ].join(','));
            return [headers.join(','), ...rows].join('\n');
        },

        generateTXT(data) {
            const now = new Date().toLocaleString();
            const separator = '═'.repeat(79);
            const thinSeparator = '─'.repeat(79);

            const stats = {
                recovered: data.filter(d => d.action === ActionDisplayConfig.RECOVERED.reportTerm).length,
                chargesAdded: data.filter(d => d.action === ActionDisplayConfig.CHARGE_ADDED.reportTerm).length,
                holdsReleased: data.filter(d => d.action === ActionDisplayConfig.HOLD_RELEASED.reportTerm).length,
                holdsCreated: data.filter(d => d.action === ActionDisplayConfig.HOLD_CREATED.reportTerm).length,
                analysisOnly: data.filter(d => d.action === ActionDisplayConfig.ANALYSIS_ONLY.reportTerm).length,
                pending: data.filter(d => d.action === ActionDisplayConfig.PENDING.reportTerm).length,
                noAction: data.filter(d => d.action === ActionDisplayConfig.NO_ACTION.reportTerm).length,
                errors: data.filter(d => d.status === 'Error').length
            };

            let report = `
${separator}
              D-DART Enterprise Batch Report v${CONFIG.VERSION}
${separator}
 Generated: ${now}
 Total Orders Processed: ${data.length}
${separator}

SUMMARY:
${thinSeparator}
  🎯 Recovered:           ${stats.recovered}
  ✅ Charges Added:       ${stats.chargesAdded}
  ✅ Holds Released:      ${stats.holdsReleased}
  📋 Holds Created:       ${stats.holdsCreated}
  📊 Analysis Only:       ${stats.analysisOnly}
  ⏳ Pending:             ${stats.pending}
  ⏸️ No Action:           ${stats.noAction}
  ❌ Errors:              ${stats.errors}

${separator}
DETAILED RESULTS:
${thinSeparator}
`;

            data.forEach((row, index) => {
                report += `
${index + 1}. Order: ${row.orderId}
   Shipper: ${row.shipper}
   Action: ${row.action}
   Amount: ${row.amount}
   Status: ${row.status}
   ${row.notes ? `Notes: ${row.notes}` : ''}
${thinSeparator}`;
            });

            report += `

${separator}
                              End of Report
${separator}
`;
            return report.trim();
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 28: APPROVAL POPUP
     * ═══════════════════════════════════════════════════════════════════════════ */

    const ApprovalPopup = (() => {
        let currentPopup = null;
        let timeoutId = null;
        let countdownInterval = null;
        let resolveCallback = null;
        let popupElements = null;
        let mutationObserver = null;

        const cleanup = () => {
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
            if (currentPopup) { currentPopup.remove(); currentPopup = null; }
            popupElements = null;
        };

        const stopCountdown = () => {
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        };

        const handleYes = (authNumber) => {
            stopCountdown(); cleanup();
            Logger.info('Approval: User approved', { authNumber: authNumber ? 'provided' : 'not required' });
            if (resolveCallback) { resolveCallback({ decision: 'YES', authorizationNumber: authNumber }); resolveCallback = null; }
        };

        const handleNo = () => {
            stopCountdown(); cleanup();
            Logger.info('Approval: User declined');
            if (resolveCallback) { resolveCallback({ decision: 'NO' }); resolveCallback = null; }
        };

        const handleSkip = () => {
            stopCountdown(); cleanup();
            Logger.info('Approval: User skipped');
            if (resolveCallback) { resolveCallback({ decision: 'SKIP' }); resolveCallback = null; }
        };

        const handleTimeout = () => {
            stopCountdown(); cleanup();
            Logger.info('Approval: Timeout');
            if (resolveCallback) { resolveCallback({ decision: 'TIMEOUT' }); resolveCallback = null; }
        };

        const startCountdown = () => {
            let secondsLeft = Math.floor(CONFIG.APPROVAL.TIMEOUT / 1000);

            countdownInterval = setInterval(() => {
                secondsLeft--;
                if (popupElements?.timer) {
                    popupElements.timer.textContent = `⏱️ ${secondsLeft}s`;
                    popupElements.timer.classList.remove('warning', 'critical');
                    if (secondsLeft <= CONFIG.APPROVAL.WARNING_TIME) popupElements.timer.classList.add('warning');
                    if (secondsLeft <= CONFIG.APPROVAL.CRITICAL_TIME) popupElements.timer.classList.add('critical');
                }
                if (secondsLeft <= 0) handleTimeout();
            }, CONFIG.APPROVAL.COUNTDOWN_INTERVAL);

            timeoutId = setTimeout(() => { handleTimeout(); }, CONFIG.APPROVAL.TIMEOUT);
        };

        const showAuthorizationInput = (orderData, totalCharge) => {
            stopCountdown();

            const popup = currentPopup?.querySelector('.d-dart-approval-popup');
            if (!popup) return;

            popup.innerHTML = `
                <div class="d-dart-approval-header"><span class="d-dart-approval-title">✅ ENTER AUTHORIZATION</span></div>
                <div class="d-dart-approval-body">
                    <div class="d-dart-approval-order-id"><span class="d-dart-approval-label">Order ID:</span><span class="d-dart-approval-value">${Helpers.escapeHtml(orderData?.orderId || 'Unknown')}</span></div>
                    <div class="d-dart-approval-charge-confirm"><span class="d-dart-approval-label">Charge Amount:</span><span class="d-dart-approval-value">${Helpers.formatCurrency(totalCharge)}</span></div>
                    <div class="d-dart-approval-auth-section">
                        <label class="d-dart-approval-auth-label" for="d-dart-approval-auth-input">Please enter the Authorization Number:</label>
                        <input type="text" class="d-dart-approval-auth-input" id="d-dart-approval-auth-input" placeholder="Enter authorization number" autocomplete="off" aria-describedby="d-dart-approval-auth-error">
                        <div class="d-dart-approval-auth-error" id="d-dart-approval-auth-error" role="alert"></div>
                    </div>
                </div>
                <div class="d-dart-approval-buttons">
                    <button class="d-dart-approval-btn submit" id="d-dart-approval-submit">SUBMIT</button>
                    <button class="d-dart-approval-btn cancel" id="d-dart-approval-cancel">CANCEL</button>
                </div>
            `;

            popupElements = {
                authInput: document.getElementById('d-dart-approval-auth-input'),
                authError: document.getElementById('d-dart-approval-auth-error'),
                submitBtn: document.getElementById('d-dart-approval-submit'),
                cancelBtn: document.getElementById('d-dart-approval-cancel')
            };

            setTimeout(() => { popupElements?.authInput?.focus(); }, 100);

            const handleAuthSubmit = () => {
                const rawAuthNumber = popupElements?.authInput?.value;
                const authNumber = Validator.sanitizeAuthNumber(rawAuthNumber);

                if (!authNumber) {
                    if (popupElements?.authError) popupElements.authError.textContent = Messages.ERRORS.AUTH_NUMBER_REQUIRED;
                    popupElements?.authInput?.classList.add('error');
                    popupElements?.authInput?.focus();
                    return;
                }

                handleYes(authNumber);
            };

            popupElements?.submitBtn?.addEventListener('click', handleAuthSubmit);
            popupElements?.cancelBtn?.addEventListener('click', handleSkip);
            popupElements?.authInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });
            popupElements?.authInput?.addEventListener('input', () => {
                if (popupElements?.authError) popupElements.authError.textContent = '';
                popupElements?.authInput?.classList.remove('error');
            });
        };

        const createPopup = (orderData, totalCharge, stopDetails) => {
            cleanup();

            const sowConfig = orderData?.sowConfig;
            const requiresAuth = sowConfig?.authNumberRequired || false;

            const overlay = document.createElement('div');
            overlay.id = 'd-dart-approval-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'd-dart-approval-title');

            overlay.innerHTML = `
                <div class="d-dart-approval-popup">
                    <div class="d-dart-approval-header">
                        <span class="d-dart-approval-title" id="d-dart-approval-title">⚠️ APPROVAL REQUIRED</span>
                        <span class="d-dart-approval-timer" id="d-dart-approval-timer">⏱️ ${Math.floor(CONFIG.APPROVAL.TIMEOUT / 1000)}s</span>
                    </div>
                    <div class="d-dart-approval-body">
                        <div class="d-dart-approval-order-id"><span class="d-dart-approval-label">Order ID:</span><span class="d-dart-approval-value">${Helpers.escapeHtml(orderData?.orderId || 'Unknown')}</span></div>
                        <div class="d-dart-approval-shipper"><span class="d-dart-approval-label">Shipper:</span><span class="d-dart-approval-value">${Helpers.escapeHtml(orderData?.shipperName || 'Unknown')}</span></div>
                        <div class="d-dart-approval-charge-info">
                            <div class="d-dart-approval-charge-title">Possible detention charge detected:</div>
                            <div class="d-dart-approval-charge-details">
                                ${stopDetails.map(s => `<div class="d-dart-approval-stop-line">📍 ${Helpers.escapeHtml(s.stopType)}: <strong>${Helpers.formatCurrency(s.charge)}</strong></div>`).join('')}
                            </div>
                            <div class="d-dart-approval-total"><span class="d-dart-approval-total-label">Total Amount:</span><span class="d-dart-approval-total-value">${Helpers.formatCurrency(totalCharge)}</span></div>
                        </div>
                        <div class="d-dart-approval-question">Do you approve this charge?</div>
                    </div>
                    <div class="d-dart-approval-buttons">
                        <button class="d-dart-approval-btn yes" id="d-dart-approval-yes" aria-label="${Messages.ACCESSIBILITY.APPROVE_CHARGE}">✅ YES</button>
                        <button class="d-dart-approval-btn no" id="d-dart-approval-no" aria-label="${Messages.ACCESSIBILITY.DECLINE_CHARGE}">❌ NO</button>
                        <button class="d-dart-approval-btn skip" id="d-dart-approval-skip" aria-label="${Messages.ACCESSIBILITY.SKIP_ORDER}">⏭️ SKIP</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            currentPopup = overlay;

            popupElements = {
                timer: document.getElementById('d-dart-approval-timer'),
                yesBtn: document.getElementById('d-dart-approval-yes'),
                noBtn: document.getElementById('d-dart-approval-no'),
                skipBtn: document.getElementById('d-dart-approval-skip')
            };

            mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const removedNode of mutation.removedNodes) {
                        if (removedNode === currentPopup || removedNode.contains?.(currentPopup)) {
                            Logger.warn('Approval popup removed externally, cleaning up');
                            stopCountdown();
                            if (resolveCallback) { resolveCallback({ decision: 'SKIP' }); resolveCallback = null; }
                            mutationObserver?.disconnect();
                            mutationObserver = null;
                            currentPopup = null;
                            popupElements = null;
                            return;
                        }
                    }
                }
            });

            mutationObserver.observe(document.body, { childList: true, subtree: true });

            popupElements.yesBtn?.addEventListener('click', () => {
                if (requiresAuth) showAuthorizationInput(orderData, totalCharge);
                else handleYes(null);
            });
            popupElements.noBtn?.addEventListener('click', handleNo);
            popupElements.skipBtn?.addEventListener('click', handleSkip);

            overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') handleSkip(); });

            popupElements.yesBtn?.focus();
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
     * SECTION 29: BATCH PROCESSOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    const BatchProcessor = (() => {
        let batchState = BatchState.IDLE;
        let startTime = null;
        let lastUIUpdate = 0;

        const initializeOrderData = (orderId) => ({
            orderId, viewData: null, fullData: null, smcExecutionData: null, fmcData: null,
            fmcTimestamps: null, analysisResults: [], shipperName: 'Unknown', sowConfig: null
        });

        const analyzeStops = (orderData) => {
            const stops = orderData?.viewData?.stops || [];
            const pricing = orderData?.viewData?.shipperPricing?.pricing || [];
            const orderStatus = orderData?.viewData?.orderExecutionStatus || 'UNKNOWN';
            const holdInfo = DataHelpers.findDetentionHolds(pricing);

            for (let index = 0; index < stops.length; index++) {
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
            const entry = { orderId: orderData?.orderId || 'Unknown', shipper: orderData?.shipperName || 'Unknown', action: ActionDisplayConfig.NO_ACTION.reportTerm, amount: '$0.00', status: 'Completed', notes: '' };

            let totalCharge = 0;
            let hasError = false;
            let hasPending = false;
            let hasChargeAdded = false;
            let hasRecovered = false;
            let hasHoldReleased = false;
            let hasHoldCreated = false;
            let hasAnalysisOnly = false;
            const notesList = [];

            for (const analysis of (orderData?.analysisResults || [])) {
                if (analysis?.processedAmount > 0) totalCharge += analysis.processedAmount;
                else if (analysis?.charge > 0 && analysis?.processed) totalCharge += analysis.charge;
                else if (analysis?.charge > 0 && (analysis?.action === ActionType.ANALYSIS_ONLY || analysis?.action === ActionType.CREATE_HOLD_ONLY)) totalCharge += analysis.charge;

                if (analysis?.processError) { hasError = true; notesList.push(analysis.processError); }
                else if (analysis?.action === ActionType.PENDING || analysis?.action === ActionType.ERROR) { hasPending = true; notesList.push(analysis.actionText || 'Pending'); }

                if (analysis?.processed) {
                    switch (analysis.processedAction) {
                        case 'updated': hasChargeAdded = true; break;
                        case 'created': hasRecovered = true; break;
                        case 'released': hasHoldReleased = true; break;
                        case 'hold_created': hasHoldCreated = true; break;
                        case 'skipped':
                        case 'timeout': hasPending = true; break;
                        case 'analysis_only': hasAnalysisOnly = true; break;
                    }
                }

                if (analysis?.action === ActionType.CREATE_HOLD_ONLY && !analysis?.processed) hasHoldCreated = true;
                if (analysis?.action === ActionType.ANALYSIS_ONLY && !analysis?.processed) hasAnalysisOnly = true;

                if (analysis?.type === ResultType.CHARGE_EXISTS) notesList.push(`Existing: $${(analysis.charge || 0).toFixed(2)}`);
                else if (analysis?.type === ResultType.DRIVER_LATE) notesList.push('Driver late');
                else if (analysis?.type === ResultType.NO_DETENTION_DROP_HOOK) notesList.push('Not eligible');
                else if (analysis?.type === ResultType.BELOW_MINIMUM_THRESHOLD) notesList.push('Below minimum');
            }

            if (hasRecovered) { entry.action = ActionDisplayConfig.RECOVERED.reportTerm; entry.amount = Helpers.formatCurrency(totalCharge); }
            else if (hasChargeAdded) { entry.action = ActionDisplayConfig.CHARGE_ADDED.reportTerm; entry.amount = Helpers.formatCurrency(totalCharge); }
            else if (hasHoldReleased) { entry.action = ActionDisplayConfig.HOLD_RELEASED.reportTerm; entry.amount = '$0.00'; }
            else if (hasHoldCreated) { entry.action = ActionDisplayConfig.HOLD_CREATED.reportTerm; entry.amount = totalCharge > 0 ? Helpers.formatCurrency(totalCharge) + ' (chargeable)' : '-'; entry.status = 'Info'; notesList.push('$0 hold created for manual review'); }
            else if (hasAnalysisOnly) { entry.action = ActionDisplayConfig.ANALYSIS_ONLY.reportTerm; entry.amount = totalCharge > 0 ? Helpers.formatCurrency(totalCharge) : '-'; entry.status = 'Info'; notesList.push('Hold already exists'); }
            else if (hasPending) { entry.action = ActionDisplayConfig.PENDING.reportTerm; entry.amount = totalCharge > 0 ? Helpers.formatCurrency(totalCharge) : '-'; }

            if (hasError) entry.status = 'Error';
            else if (hasPending) entry.status = 'Pending';

            entry.notes = notesList.join('; ');
            AppState.addBatchReportEntry(entry);
        };

        const ensureValidToken = async () => {
            const remaining = TokenManager.getRemainingSeconds();
            if (remaining < CONFIG.TOKEN.WARNING_THRESHOLD) {
                UIController.updateBatchStatus(Messages.INFO.TOKEN_REFRESHING);
                const success = await TokenManager.ensure();
                if (!success) throw ErrorHandler.create(ErrorType.AUTH, Messages.ERRORS.TOKEN_MISSING, { action: 'ensureToken' });
            }
        };

        const executeActionsWithRetry = async (orderData, maxRetries = 2) => {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try { await executeActions(orderData); return; }
                catch (error) {
                    if (error.type === ErrorType.BUSINESS && error.message?.includes('Version conflict')) {
                        if (attempt < maxRetries) {
                            Logger.warn(`Version conflict, refetching order (attempt ${attempt + 1})`);
                            orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);
                            continue;
                        }
                    }
                    throw error;
                }
            }
        };

        const executeActions = async (orderData) => {
            const orderId = orderData?.orderId;
            if (!orderId) return;

            let chargeAdded = false;
            let releaseProcessed = false;
            let holdCreated = false;

            const releaseActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.RELEASE_HOLD);
            const updateActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.ADD_CHARGE_UPDATE);
            const createActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.ADD_CHARGE_CREATE);
            const createHoldOnlyActions = (orderData.analysisResults || []).filter(a => a?.action === ActionType.CREATE_HOLD_ONLY);

            const needsFullData = releaseActions.length > 0 || updateActions.length > 0 || createActions.length > 0 || createHoldOnlyActions.length > 0;
            if (!needsFullData) return;

            if (!orderData.fullData) orderData.fullData = await SMCApiService.fetchOrderFull(orderId);

            let currentVersion = orderData.fullData?.orderId?.version;

            if (releaseActions.length > 0 || updateActions.length > 0) {
                const pricing = [...(orderData.fullData?.orderDetails?.shipperPricing?.pricing || [])];
                let modified = false;

                for (const analysis of updateActions) {
                    if (analysis?.holdCode) {
                        const itemIndex = pricing.findIndex(p => p?.pricingCode === analysis.holdCode);
                        if (itemIndex !== -1) {
                            pricing[itemIndex] = { ...pricing[itemIndex], price: { ...pricing[itemIndex].price, value: analysis.charge } };
                            analysis.processed = true; analysis.processedAction = 'updated'; analysis.processedAmount = analysis.charge;
                            modified = true; chargeAdded = true;
                        }
                    }
                }

                for (const analysis of releaseActions) {
                    if (analysis?.holdCode) {
                        const itemIndex = pricing.findIndex(p => p?.pricingCode === analysis.holdCode);
                        if (itemIndex !== -1) {
                            pricing.splice(itemIndex, 1);
                            analysis.processed = true; analysis.processedAction = 'released';
                            modified = true; releaseProcessed = true;
                        }
                    }
                }

                if (modified) {
                    await SMCApiService.updateOrder(orderData.fullData, pricing);
                    if (CONFIG.FEATURES.UNDO_ENABLED) AppState.pushUndo({ type: 'ORDER_UPDATE', orderId, timestamp: Date.now(), previousPricing: orderData.fullData?.orderDetails?.shipperPricing?.pricing });
                    if (createActions.length > 0 || createHoldOnlyActions.length > 0) {
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        currentVersion = orderData.fullData?.orderId?.version;
                    }
                }
            }

            for (const analysis of createActions) {
                try {
                    const pricingConfig = DataHelpers.getDetentionPricingConfig(analysis.isPickup);
                    await SMCApiService.addPricingLine(orderId, currentVersion, pricingConfig, analysis.charge);
                    analysis.processed = true; analysis.processedAction = 'created'; analysis.processedAmount = analysis.charge;
                    chargeAdded = true;
                    if (CONFIG.FEATURES.UNDO_ENABLED) AppState.pushUndo({ type: 'PRICING_CREATE', orderId, timestamp: Date.now(), pricingCode: pricingConfig.pricingCode, amount: analysis.charge });
                    if (createActions.indexOf(analysis) < createActions.length - 1 || createHoldOnlyActions.length > 0) {
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        currentVersion = orderData.fullData?.orderId?.version;
                    }
                } catch (error) {
                    analysis.processed = false; analysis.processError = error.message;
                    Logger.error(`Create failed: ${error.message}`);
                }
            }

            for (const analysis of createHoldOnlyActions) {
                try {
                    const pricingConfig = DataHelpers.getDetentionPricingConfig(analysis.isPickup);
                    await SMCApiService.addPricingLine(orderId, currentVersion, pricingConfig, 0);
                    analysis.processed = true; analysis.processedAction = 'hold_created'; analysis.processedAmount = 0;
                    holdCreated = true;
                    Logger.info(`Created $0 hold for ${analysis.isPickup ? 'SHIPPER' : 'RECEIVER'} (Analysis Only)`);
                    if (CONFIG.FEATURES.UNDO_ENABLED) AppState.pushUndo({ type: 'HOLD_CREATE', orderId, timestamp: Date.now(), pricingCode: pricingConfig.pricingCode, amount: 0 });
                    if (createHoldOnlyActions.indexOf(analysis) < createHoldOnlyActions.length - 1) {
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        currentVersion = orderData.fullData?.orderId?.version;
                    }
                } catch (error) {
                    analysis.processed = false; analysis.processError = error.message;
                    Logger.error(`Create $0 hold failed: ${error.message}`);
                }
            }

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
                if (!isBatchMode) throw ErrorHandler.create(ErrorType.SOW, sowValidation.error, { orderId, shipper: orderData.shipperName });
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
                } catch (fmcError) {
                    Logger.warn('FMC fetch failed', fmcError.message);
                    orderData.fmcTimestamps = null;
                }
            }

            analyzeStops(orderData);

            const pendingApprovals = orderData.analysisResults.filter(r => r?.action === ActionType.PENDING_APPROVAL);

            if (pendingApprovals.length > 0 && isBatchMode) {
                AppState.addPendingApprovalOrder(orderData);
                Logger.debug(`Order ${orderId} queued for approval`);
                return orderData;
            }

            const actionsNeeded = orderData.analysisResults.filter(r =>
                r?.action === ActionType.ADD_CHARGE_UPDATE || r?.action === ActionType.ADD_CHARGE_CREATE ||
                r?.action === ActionType.RELEASE_HOLD || r?.action === ActionType.CREATE_HOLD_ONLY
            );

            if (actionsNeeded.length > 0) {
                orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                await executeActionsWithRetry(orderData);
            }

            addToBatchReport(orderData);
            CacheManager.invalidate(orderId);
            RequestDeduplicator.clear();

            return orderData;
        };

        const processOrderWithRetry = async (orderId, attempt = 1) => {
            try { return await processSingleOrder(orderId, true); }
            catch (error) {
                if (ErrorHandler.isRateLimitError(error)) {
                    Logger.warn(`Rate limited on ${orderId}, waiting...`);
                    await sleep(CONFIG.BATCH.RATE_LIMIT_DELAY * 3);
                }

                if (attempt < CONFIG.API.MAX_RETRIES && ErrorHandler.isRetryableError(error)) {
                    Logger.warn(`Retry ${attempt + 1} for ${orderId}`);
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

            UIController.updateEnhancedBatchProgress({
                processed: processedOrders.size + failedOrders.length,
                success: processedOrders.size,
                failed: failedOrders.length,
                total: totalOrders,
                startTime: startTime
            });
        };

        const processChunk = async (chunk, chunkIndex) => {
            const parallelBatches = chunkArray(chunk, CONFIG.BATCH.PARALLEL_SIZE);

            for (const parallelBatch of parallelBatches) {
                if (batchState === BatchState.CANCELLED || batchState === BatchState.PAUSED) break;

                const results = await Promise.allSettled(parallelBatch.map(orderId => processOrderWithRetry(orderId)));

                for (let i = 0; i < results.length; i++) {
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
            await ensureHoldsExist(orderData, pendingApprovals);

            const totalCharge = pendingApprovals.reduce((sum, a) => sum + (a?.charge || 0), 0);
            const stopDetails = pendingApprovals.map(a => ({ stopType: a?.isPickup ? 'SHIPPER' : 'RECEIVER', charge: a?.charge || 0 }));

            const decision = await ApprovalPopup.show(orderData, totalCharge, stopDetails);
            await processApprovalDecision(orderData, decision, pendingApprovals);
        };

        const ensureHoldsExist = async (orderData, pendingApprovals) => {
            if (!orderData.fullData) orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);

            const pricing = orderData.fullData?.orderDetails?.shipperPricing?.pricing || [];
            const holdInfo = DataHelpers.findDetentionHolds(pricing);

            for (const analysis of pendingApprovals) {
                const isPickup = analysis?.isPickup;
                const holdExists = isPickup ? holdInfo.shipperExists : holdInfo.receiverExists;

                if (!holdExists) {
                    const pricingConfig = DataHelpers.getDetentionPricingConfig(isPickup);

                    try {
                        await SMCApiService.addPricingLine(orderData.orderId, orderData.fullData?.orderId?.version, pricingConfig, 0);
                        Logger.info(`Created $0 hold for ${isPickup ? 'SHIPPER' : 'RECEIVER'}`);
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);
                        analysis.hasHold = true;
                        analysis.holdCode = pricingConfig.pricingCode;
                    } catch (error) {
                        Logger.error(`Failed to create $0 hold: ${error.message}`);
                    }
                }
            }
        };

        const processApprovalDecision = async (orderData, decision, pendingApprovals) => {
            orderData.fullData = await SMCApiService.fetchOrderFull(orderData.orderId);

            switch (decision.decision) {
                case 'YES': await handleApproved(orderData, decision.authorizationNumber, pendingApprovals); break;
                case 'NO': await handleDeclined(orderData, pendingApprovals); break;
                case 'SKIP': handleSkipped(pendingApprovals); break;
                case 'TIMEOUT': handleTimedOut(pendingApprovals); break;
            }
        };

        const handleApproved = async (orderData, authNumber, pendingApprovals) => {
            const pricing = [...(orderData.fullData?.orderDetails?.shipperPricing?.pricing || [])];
            let modified = false;

            for (const analysis of pendingApprovals) {
                const itemIndex = pricing.findIndex(p => {
                    const code = String(p?.pricingCode || '').toUpperCase();
                    const isDetention = code.includes('DETENTION');
                    const matchesType = analysis?.isPickup ? (code.includes('SHIPPER') || code.includes('ORIGIN')) : (code.includes('RECEIVER') || code.includes('DESTINATION'));
                    return isDetention && matchesType;
                });

                if (itemIndex !== -1) {
                    pricing[itemIndex] = { ...pricing[itemIndex], price: { ...pricing[itemIndex].price, value: analysis?.charge || 0 } };
                    analysis.processed = true; analysis.processedAction = 'updated'; analysis.processedAmount = analysis?.charge || 0; analysis.authorizationNumber = authNumber;
                    modified = true;
                }
            }

            if (modified) {
                await SMCApiService.updateOrder(orderData.fullData, pricing);
                const comment = authNumber ? Messages.COMMENTS.CHARGE_WITH_AUTH(authNumber) : Messages.COMMENTS.ADD_CHARGE;
                await SMCApiService.addComment(orderData.orderId, comment);
            }
        };

        const handleDeclined = async (orderData, pendingApprovals) => {
            const pricing = [...(orderData.fullData?.orderDetails?.shipperPricing?.pricing || [])];
            let modified = false;

            for (const analysis of pendingApprovals) {
                const itemIndex = pricing.findIndex(p => {
                    const code = String(p?.pricingCode || '').toUpperCase();
                    const isDetention = code.includes('DETENTION');
                    const matchesType = analysis?.isPickup ? (code.includes('SHIPPER') || code.includes('ORIGIN')) : (code.includes('RECEIVER') || code.includes('DESTINATION'));
                    return isDetention && matchesType;
                });

                if (itemIndex !== -1) {
                    pricing.splice(itemIndex, 1);
                    analysis.processed = true; analysis.processedAction = 'released';
                    modified = true;
                }
            }

            if (modified) {
                await SMCApiService.updateOrder(orderData.fullData, pricing);
                await SMCApiService.addComment(orderData.orderId, Messages.COMMENTS.APPROVAL_DECLINED);
            }
        };

        const handleSkipped = (pendingApprovals) => {
            for (const analysis of pendingApprovals) {
                if (analysis) { analysis.processed = true; analysis.processedAction = 'skipped'; }
            }
        };

        const handleTimedOut = (pendingApprovals) => {
            for (const analysis of pendingApprovals) {
                if (analysis) { analysis.processed = true; analysis.processedAction = 'timeout'; }
            }
        };

        const processPendingApprovalOrders = async () => {
            const pendingOrders = AppState.get('pendingApprovalOrders');
            if (pendingOrders.length === 0) return;

            UIController.updateBatchStatus(`Processing ${pendingOrders.length} orders requiring approval...`);

            for (let i = 0; i < pendingOrders.length; i++) {
                if (batchState === BatchState.CANCELLED) break;

                const pendingOrder = pendingOrders[i];
                UIController.updateBatchStatus(`Approval ${i + 1}/${pendingOrders.length}: ${pendingOrder?.orderId || 'Unknown'}`);

                await processApproval(pendingOrder);

                if (i < pendingOrders.length - 1) await sleep(CONFIG.BATCH.PAUSE_CHECK_INTERVAL);
            }
        };

        const processApproval = async (orderData) => {
            const pendingApprovals = (orderData?.analysisResults || []).filter(r => r?.action === ActionType.PENDING_APPROVAL);

            if (pendingApprovals.length === 0) { addToBatchReport(orderData); return; }

            await ensureHoldsExist(orderData, pendingApprovals);

            const totalCharge = pendingApprovals.reduce((sum, a) => sum + (a?.charge || 0), 0);
            const stopDetails = pendingApprovals.map(a => ({ stopType: a?.isPickup ? 'SHIPPER' : 'RECEIVER', charge: a?.charge || 0 }));

            const decision = await ApprovalPopup.show(orderData, totalCharge, stopDetails);
            await processApprovalDecision(orderData, decision, pendingApprovals);

            addToBatchReport(orderData);
            CacheManager.invalidate(orderData?.orderId);
        };

        const saveProgress = (orderIds, chunkIndex) => {
            const processedOrders = AppState.get('processedOrders');
            const failedOrders = AppState.get('failedOrders');
            const batchReportData = AppState.get('batchReportData');

            ProgressManager.save({
                orderIds, chunkIndex, processedCount: processedOrders.size, failedCount: failedOrders.length,
                batchReportData, processedIds: Array.from(processedOrders.keys())
            });
        };

        const initializeBatch = (orderIds) => {
            const chunks = chunkArray(orderIds, CONFIG.BATCH.CHUNK_SIZE);

            AppState.resetBatch();
            AppState.update({
                currentOrderIds: orderIds, currentIndex: 0, totalOrders: orderIds.length, isProcessing: true,
                isSingleMode: orderIds.length === 1, batchState: BatchState.RUNNING, batchStartTime: Date.now(),
                currentChunk: 0, totalChunks: chunks.length, processedOrders: new Map(), failedOrders: []
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
                UIController.showBatchComplete(AppState.get('batchReportData'));
                UIController.showToast(Messages.SUCCESS.BATCH_COMPLETE(processedOrders.size, failedOrders.length), failedOrders.length > 0 ? 'warning' : 'success');
            }
        };

        const processEnhancedBatch = async (orderIds) => {
            const chunks = chunkArray(orderIds, CONFIG.BATCH.CHUNK_SIZE);

            UIController.showEnhancedBatchProgress(orderIds.length, chunks.length);

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                if (batchState === BatchState.CANCELLED) { Logger.info(Messages.INFO.BATCH_CANCELLED); break; }

                while (batchState === BatchState.PAUSED) {
                    await sleep(CONFIG.BATCH.PAUSE_CHECK_INTERVAL);
                    if (batchState === BatchState.CANCELLED) break;
                }

                AppState.set('currentChunk', chunkIndex);
                const chunk = chunks[chunkIndex];

                await ensureValidToken();
                UIController.updateBatchStatus(`Processing chunk ${chunkIndex + 1}/${chunks.length}...`);

                await processChunk(chunk, chunkIndex);
                saveProgress(orderIds, chunkIndex);

                if (chunkIndex < chunks.length - 1 && batchState === BatchState.RUNNING) {
                    UIController.updateBatchStatus(Messages.INFO.COOLING_DOWN);
                    await sleep(CONFIG.BATCH.CHUNK_DELAY);
                }
            }

            if (batchState !== BatchState.CANCELLED) await processPendingApprovalOrders();
        };

        const processSingleOrderDetailed = async (orderId) => {
            const steps = [
                { id: 'token', text: 'Checking authentication...', icon: '🔐' },
                { id: 'fetch', text: 'Fetching order & tour data...', icon: '📥' },
                { id: 'fmc', text: 'Fetching FMC timestamps...', icon: '⏱️' },
                { id: 'analyze', text: 'Analyzing detention...', icon: '🔍' },
                { id: 'process', text: 'Processing actions...', icon: '⚡' },
                { id: 'complete', text: 'Complete!', icon: '✅' }
            ];

            UIController.showProgress(steps);
            const orderData = initializeOrderData(orderId);

            try {
                UIController.updateProgressStep('token', 'active');
                await sleep(100);
                UIController.updateProgressStep('token', 'completed', 'Token ready');

                UIController.updateProgressStep('fetch', 'active');
                const [viewData, smcExecResult] = await Promise.all([
                    HttpClient.request({ method: 'GET', url: `${CONFIG.URLS.SMC_BASE}/shipper/order/view/${encodeURIComponent(orderId)}`, headers: { 'Accept': 'application/json' } }, 'Order View', circuitBreakers.smc),
                    ErrorHandler.wrap(() => FMCApiService.fetchSMCExecution(orderId), ErrorType.NETWORK, null, false)
                ]);

                orderData.viewData = viewData;
                orderData.smcExecutionData = smcExecResult;
                orderData.shipperName = viewData?.shipperDetails?.shipperName || 'Unknown';

                const sowValidation = SOWConfigManager.validateShipper(orderData.shipperName);
                if (!sowValidation.valid) throw ErrorHandler.create(ErrorType.SOW, sowValidation.error, { orderId, shipper: orderData.shipperName });

                orderData.sowConfig = sowValidation.config;

                const tourInfo = smcExecResult ? `Tour: ${String(smcExecResult.tourId || '').substring(0, 15)}...` : 'Tour unavailable';
                UIController.updateProgressStep('fetch', 'completed', tourInfo);

                UIController.updateProgressStep('fmc', 'active');
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
                        UIController.updateProgressStep('fmc', 'completed', 'Timestamps loaded');
                    } catch (fmcError) {
                        Logger.warn('FMC fetch failed', fmcError.message);
                        UIController.updateProgressStep('fmc', 'error', 'FMC unavailable');
                    }
                } else {
                    UIController.updateProgressStep('fmc', 'error', 'No Tour ID');
                }

                UIController.updateProgressStep('analyze', 'active');
                analyzeStops(orderData);
                UIController.updateProgressStep('analyze', 'completed', `${orderData.analysisResults.length} stops analyzed`);

                const pendingApprovals = orderData.analysisResults.filter(r => r?.action === ActionType.PENDING_APPROVAL);

                if (pendingApprovals.length > 0) {
                    UIController.updateProgressStep('process', 'active', 'Approval required...');
                    await handleApprovalFlow(orderData, pendingApprovals);
                    UIController.updateProgressStep('process', 'completed', 'Processed');
                } else {
                    const actionsNeeded = orderData.analysisResults.filter(r =>
                        r?.action === ActionType.ADD_CHARGE_UPDATE || r?.action === ActionType.ADD_CHARGE_CREATE ||
                        r?.action === ActionType.RELEASE_HOLD || r?.action === ActionType.CREATE_HOLD_ONLY
                    );

                    const analysisOnlyActions = orderData.analysisResults.filter(r => r?.action === ActionType.ANALYSIS_ONLY);

                    if (actionsNeeded.length === 0) {
                        if (analysisOnlyActions.length > 0) UIController.updateProgressStep('process', 'completed', 'Analysis only (no auto-charge)');
                        else UIController.updateProgressStep('process', 'completed', 'No actions needed');
                    } else {
                        UIController.updateProgressStep('process', 'active', `Processing ${actionsNeeded.length} action(s)...`);
                        orderData.fullData = await SMCApiService.fetchOrderFull(orderId);
                        await executeActionsWithRetry(orderData);
                        UIController.updateProgressStep('process', 'completed', `${actionsNeeded.length} action(s) completed`);
                    }
                }

                UIController.updateProgressStep('complete', 'completed');
                CacheManager.invalidate(orderId);
                RequestDeduplicator.clear();
                AppState.set('singleOrderData', orderData);
                UIController.displaySingleOrderResults(orderData);

            } catch (error) {
                Logger.error('Processing error', error.message);
                UIController.showProcessingError(error.message);
            }
        };

        const promptResumeProgress = (savedProgress) => {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.id = 'd-dart-resume-overlay';
                overlay.innerHTML = `
                    <div class="d-dart-resume-popup">
                        <div class="d-dart-resume-title">📋 Resume Previous Batch?</div>
                        <div class="d-dart-resume-info">
                            Found saved progress:<br>
                            <strong>${savedProgress.processedCount}</strong> orders processed<br>
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
        };

        const resumeFromProgress = async (savedProgress, orderIds) => {
            Logger.info(`Resuming batch: ${savedProgress.processedCount} already processed`);

            AppState.set('batchReportData', savedProgress.batchReportData || []);

            const processedIds = new Set(savedProgress.processedIds || []);
            const remainingOrders = orderIds.filter(id => !processedIds.has(id));

            if (remainingOrders.length === 0) { UIController.showBatchComplete(savedProgress.batchReportData); return; }

            await startFreshBatch(remainingOrders);
        };

        const startFreshBatch = async (orderIds) => {
            initializeBatch(orderIds);

            const tokenOk = await TokenManager.ensure();
            if (!tokenOk) { UIController.showProcessingError(Messages.ERRORS.TOKEN_MISSING); AppState.set('isProcessing', false); return; }

            if (orderIds.length > 10) TokenManager.startAutoRefresh();

            if (orderIds.length === 1) await processSingleOrderDetailed(orderIds[0]);
            else await processEnhancedBatch(orderIds);

            finalizeBatch();
        };

        const isSameBatch = (savedIds, currentIds) => {
            if (!savedIds || savedIds.length !== currentIds.length) return false;
            return savedIds.every((id, i) => id === currentIds[i]);
        };

        return {
            async processBatch(orderIds) {
                if (!SOWConfigManager.isLoaded()) { UIController.showToast(Messages.ERRORS.SOW_SERVER_UNREACHABLE, 'error'); return; }
                if (orderIds.length > CONFIG.BATCH.MAX_ORDERS_PER_SESSION) { UIController.showToast(Messages.ERRORS.BATCH_TOO_LARGE(CONFIG.BATCH.MAX_ORDERS_PER_SESSION), 'error'); return; }

                const savedProgress = ProgressManager.load();
                if (savedProgress && isSameBatch(savedProgress.orderIds, orderIds)) {
                    const resume = await promptResumeProgress(savedProgress);
                    if (resume) return resumeFromProgress(savedProgress, orderIds);
                }

                await startFreshBatch(orderIds);
            },

            pause() {
                if (batchState === BatchState.RUNNING) {
                    batchState = BatchState.PAUSED;
                    AppState.set('batchState', BatchState.PAUSED);
                    Logger.info('Batch paused');
                    UIController.updateBatchStatus(Messages.INFO.BATCH_PAUSED);
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

            getState() { return batchState; }
        };
    })();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 30: HEALTH CHECK SYSTEM
     * ═══════════════════════════════════════════════════════════════════════════ */

    const HealthCheck = {
        check() {
            return {
                timestamp: Date.now(), version: CONFIG.VERSION, appState: AppState.getSnapshot(),
                tokenStatus: TokenManager.getStatus(), sowStatus: SOWConfigManager.getStatus(),
                versionStatus: VersionManager.getStatus(),
                circuitBreakers: {
                    smc: circuitBreakers.smc.getState(), fmc: circuitBreakers.fmc.getState(),
                    execution: circuitBreakers.execution.getState(), sharepoint: circuitBreakers.sharepoint.getState()
                },
                cache: CacheManager.getStats(), performance: PerformanceMonitor.getMetrics(), telemetry: Telemetry.getMetrics(),
                ui: { isMinimized: AppState.get('isMinimized'), isProcessing: AppState.get('isProcessing'), batchState: AppState.get('batchState'), isSettingsOpen: AppState.get('isSettingsOpen') }
            };
        },

        isHealthy() {
            const status = this.check();
            const circuitBreakerOpen = Object.values(status.circuitBreakers).some(s => s?.state === CircuitBreakerState.OPEN);
            const tokenExpired = status.tokenStatus?.status === 'expired';
            const sowNotLoaded = status.sowStatus?.status !== SOWStatus.LOADED;
            return !circuitBreakerOpen && !tokenExpired && !sowNotLoaded;
        },

        getSummary() {
            const status = this.check();
            const issues = [];

            if (status.tokenStatus?.status === 'expired') issues.push('Token expired');
            if (status.tokenStatus?.status === 'missing') issues.push('Token missing');
            if (status.sowStatus?.status !== SOWStatus.LOADED) issues.push(`SOW: ${status.sowStatus?.status}`);

            Object.entries(status.circuitBreakers).forEach(([name, state]) => {
                if (state?.state === CircuitBreakerState.OPEN) issues.push(`${name.toUpperCase()} circuit open`);
            });

            if (issues.length === 0) return '✅ System healthy';
            return `⚠️ Issues: ${issues.join(', ')}`;
        }
    };

  /* ═══════════════════════════════════════════════════════════════════════════
   * SECTION 31: STYLES
   * ═══════════════════════════════════════════════════════════════════════════ */

 const Styles = `
    /* Base styles */
    #d-dart, #d-dart * {
        box-sizing: border-box !important;
        font-family: 'Amazon Ember', 'Segoe UI', Tahoma, sans-serif !important;
    }

    #d-dart {
        position: fixed !important;
        top: ${CONFIG.INITIAL_POSITION.top} !important;
        left: ${CONFIG.INITIAL_POSITION.left} !important;
        right: ${CONFIG.INITIAL_POSITION.right} !important;
        width: ${CONFIG.UI.PANEL_WIDTH}px !important;
        background: #232F3E !important;
        border: 2px solid #FF9900 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
        z-index: 2147483647 !important;
        color: #FFF !important;
        overflow: hidden !important;
        transition: box-shadow 0.2s ease, width 0.3s ease, height 0.3s ease, border-radius 0.3s ease !important;
    }

    #d-dart.dragging {
        opacity: 0.9 !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6) !important;
        cursor: grabbing !important;
    }

    #d-dart.minimized {
        width: ${CONFIG.UI.PANEL_MIN_WIDTH}px !important;
        height: ${CONFIG.UI.PANEL_MIN_WIDTH}px !important;
        border-radius: 50% !important;
        cursor: grab !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
    }

    #d-dart.minimized:hover {
        box-shadow: 0 0 20px rgba(255,153,0,0.6) !important;
        transform: scale(1.05) !important;
    }

    #d-dart.minimized #d-dart-header,
    #d-dart.minimized #d-dart-body {
        display: none !important;
    }

    #d-dart.minimized #d-dart-minimized-icon {
        display: flex !important;
    }

    #d-dart-minimized-icon {
        display: none !important;
        font-size: 26px !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        height: 100% !important;
        cursor: pointer !important;
    }

    /* Minimized state indicators */
    #d-dart.minimized.healthy { box-shadow: 0 0 20px rgba(0,255,136,0.5) !important; }
    #d-dart.minimized.unhealthy { box-shadow: 0 0 20px rgba(255,107,107,0.5) !important; }

    /* Header */
    #d-dart-header {
        background: linear-gradient(90deg, #FF9900 0%, #E88B00 100%) !important;
        padding: 10px 12px !important;
        cursor: grab !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        user-select: none !important;
    }

    #d-dart-header:active { cursor: grabbing !important; }

    #d-dart-header h3 {
        margin: 0 !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        color: #232F3E !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        flex-wrap: wrap !important;
    }

    .d-dart-version-badge {
        font-size: 9px !important;
        background: rgba(0,0,0,0.2) !important;
        padding: 2px 6px !important;
        border-radius: 8px !important;
    }

    .d-dart-status-indicators {
        display: flex !important;
        gap: 4px !important;
        align-items: center !important;
    }

    .d-dart-token-indicator, .d-dart-sow-indicator {
        font-size: 9px !important;
        padding: 2px 6px !important;
        border-radius: 8px !important;
        font-weight: 700 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        cursor: pointer !important;
    }

    .d-dart-token-indicator.ready, .d-dart-sow-indicator.loaded { background: rgba(0,128,0,0.3) !important; color: #004d00 !important; }
    .d-dart-token-indicator.warning { background: rgba(255,200,0,0.4) !important; color: #6b5900 !important; }
    .d-dart-token-indicator.critical { background: rgba(255,100,100,0.4) !important; color: #8b0000 !important; animation: d-dart-pulse 0.5s infinite !important; }
    .d-dart-token-indicator.fetching, .d-dart-sow-indicator.loading { background: rgba(0,0,255,0.2) !important; color: #00008b !important; }
    .d-dart-token-indicator.error, .d-dart-sow-indicator.error { background: rgba(255,0,0,0.25) !important; color: #8b0000 !important; }

    .d-dart-header-right {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
    }

    .d-dart-signature {
        font-size: 14px !important;
        color: #232F3E !important;
        font-weight: 800 !important;
        text-shadow: 0 1px 2px rgba(255,255,255,0.3) !important;
    }

    .d-dart-header-buttons {
        display: flex !important;
        gap: 8px !important;
    }

    .d-dart-header-btn {
        background: transparent !important;
        border: none !important;
        color: #232F3E !important;
        font-size: 16px !important;
        cursor: pointer !important;
        padding: 2px 5px !important;
        transition: transform 0.2s ease !important;
        font-weight: bold !important;
        line-height: 1 !important;
    }

    .d-dart-header-btn:hover { transform: scale(1.2) !important; }
    .d-dart-header-btn:focus { outline: 2px solid #232F3E !important; outline-offset: 2px !important; }

    /* Body */
    #d-dart-body {
        padding: 12px !important;
        max-height: 75vh !important;
        overflow-y: auto !important;
        background: #1a242f !important;
    }

    /* Input */
    .d-dart-input-group {
        display: flex !important;
        gap: 8px !important;
        margin-bottom: 12px !important;
    }

    .d-dart-input {
        flex: 1 !important;
        padding: 10px 12px !important;
        border: 2px solid #37475A !important;
        border-radius: 6px !important;
        background: #232F3E !important;
        color: #FFF !important;
        font-size: 13px !important;
        outline: none !important;
        transition: border-color 0.2s ease !important;
    }

    .d-dart-input:focus { border-color: #FF9900 !important; }
    .d-dart-input.error { border-color: #ff6b6b !important; animation: d-dart-shake 0.3s !important; }
    .d-dart-input::placeholder { color: #666 !important; font-size: 11px !important; }
    .d-dart-input:disabled { opacity: 0.6 !important; cursor: not-allowed !important; }

    @keyframes d-dart-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }

    @keyframes d-dart-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    @keyframes d-dart-spin {
        to { transform: rotate(360deg); }
    }

    /* Button */
    .d-dart-btn {
        padding: 10px 20px !important;
        background: #FF9900 !important;
        border: none !important;
        border-radius: 6px !important;
        color: #232F3E !important;
        font-weight: 700 !important;
        font-size: 13px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        min-width: 90px !important;
        position: relative !important;
    }

    .d-dart-btn:hover:not(:disabled) {
        background: #FEBD69 !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 12px rgba(255,153,0,0.4) !important;
    }

    .d-dart-btn:focus { outline: 2px solid #FFF !important; outline-offset: 2px !important; }
    .d-dart-btn:disabled { background: #555 !important; cursor: not-allowed !important; }

    .d-dart-btn.loading { color: transparent !important; }
    .d-dart-btn.loading::after {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        top: 50%;
        left: 50%;
        margin: -8px 0 0 -8px;
        border: 2px solid #232F3E;
        border-top-color: transparent;
        border-radius: 50%;
        animation: d-dart-spin 0.8s linear infinite;
    }

    /* Toast */
    .d-dart-toast {
        position: fixed !important;
        bottom: 25px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(20px) !important;
        background: #FF9900 !important;
        color: #232F3E !important;
        padding: 10px 20px !important;
        border-radius: 8px !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        z-index: 2147483648 !important;
        opacity: 0 !important;
        transition: all 0.3s ease !important;
        pointer-events: none !important;
        max-width: 400px !important;
        text-align: center !important;
    }

    .d-dart-toast.show {
        opacity: 1 !important;
        transform: translateX(-50%) translateY(0) !important;
    }

    .d-dart-toast.error { background: #ff6b6b !important; color: #FFF !important; }
    .d-dart-toast.success { background: #00ff88 !important; color: #232F3E !important; }
    .d-dart-toast.warning { background: #ffd700 !important; color: #232F3E !important; }

    /* Visually hidden for accessibility */
    .d-dart-visually-hidden {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        overflow: hidden !important;
        clip: rect(0, 0, 0, 0) !important;
        white-space: nowrap !important;
        border: 0 !important;
    }

    /* Settings panel styles (popup version - kept for compatibility) */
    .d-dart-settings-panel {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: ${CONFIG.UI.SETTINGS_PANEL_WIDTH}px !important;
        max-width: 95vw !important;
        max-height: 85vh !important;
        background: #232F3E !important;
        border: 2px solid #FF9900 !important;
        border-radius: 12px !important;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important;
        z-index: 2147483648 !important;
        display: flex !important;
        flex-direction: column !important;
        animation: d-dart-slideIn 0.3s ease !important;
    }

    @keyframes d-dart-slideIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    .d-dart-settings-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0,0,0,0.6) !important;
        z-index: 2147483647 !important;
    }

    .d-dart-settings-header {
        background: linear-gradient(90deg, #FF9900, #E88B00) !important;
        padding: 12px 16px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        border-radius: 10px 10px 0 0 !important;
        flex-shrink: 0 !important;
    }

    .d-dart-settings-title {
        font-size: 16px !important;
        font-weight: 700 !important;
        color: #232F3E !important;
    }

    .d-dart-settings-close {
        background: rgba(0,0,0,0.2) !important;
        border: none !important;
        color: #232F3E !important;
        font-size: 18px !important;
        width: 28px !important;
        height: 28px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-settings-close:hover {
        background: rgba(0,0,0,0.4) !important;
        transform: scale(1.1) !important;
    }

    .d-dart-settings-body {
        padding: 16px !important;
        overflow-y: auto !important;
        flex: 1 !important;
    }

    .d-dart-settings-section {
        background: #37475A !important;
        border-radius: 8px !important;
        padding: 12px !important;
        margin-bottom: 12px !important;
    }

    .d-dart-settings-section-title {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        text-transform: uppercase !important;
        margin-bottom: 10px !important;
        letter-spacing: 0.5px !important;
    }

    .d-dart-stats-grid {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 8px !important;
        margin-bottom: 10px !important;
    }

    .d-dart-stat-box {
        background: #1a242f !important;
        border-radius: 6px !important;
        padding: 10px 8px !important;
        text-align: center !important;
    }

    .d-dart-stat-box .d-dart-stat-value {
        display: block !important;
        font-size: 20px !important;
        font-weight: 700 !important;
        color: #FFF !important;
    }

    .d-dart-stat-box .d-dart-stat-label {
        font-size: 9px !important;
        color: #888 !important;
        text-transform: uppercase !important;
    }

    .d-dart-stat-box.active .d-dart-stat-value { color: #00ff88 !important; }
    .d-dart-stat-box.inactive .d-dart-stat-value { color: #888 !important; }
    .d-dart-stat-box.error .d-dart-stat-value { color: #ff6b6b !important; }

    .d-dart-last-refresh {
        font-size: 11px !important;
        color: #888 !important;
        text-align: center !important;
    }

    .d-dart-settings-actions {
        display: flex !important;
        gap: 8px !important;
        margin-bottom: 12px !important;
    }

    .d-dart-action-btn {
        flex: 1 !important;
        padding: 8px 12px !important;
        background: #37475A !important;
        border: 1px solid #485769 !important;
        border-radius: 6px !important;
        color: #FFF !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-action-btn:hover {
        background: #485769 !important;
        border-color: #FF9900 !important;
    }

    .d-dart-search-box {
        position: relative !important;
        margin-bottom: 10px !important;
    }

    .d-dart-search-input {
        width: 100% !important;
        padding: 10px 12px 10px 36px !important;
        background: #1a242f !important;
        border: 2px solid #485769 !important;
        border-radius: 6px !important;
        color: #FFF !important;
        font-size: 13px !important;
        outline: none !important;
        transition: border-color 0.2s ease !important;
    }

    .d-dart-search-input:focus { border-color: #FF9900 !important; }
    .d-dart-search-input::placeholder { color: #666 !important; }

    .d-dart-search-icon {
        position: absolute !important;
        left: 12px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        font-size: 14px !important;
        opacity: 0.6 !important;
    }

    .d-dart-filters-grid {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 8px !important;
        margin-bottom: 10px !important;
    }

    .d-dart-filter-group {
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
    }

    .d-dart-filter-label {
        font-size: 10px !important;
        color: #888 !important;
        text-transform: uppercase !important;
    }

    .d-dart-filter-select {
        padding: 6px 8px !important;
        background: #1a242f !important;
        border: 1px solid #485769 !important;
        border-radius: 4px !important;
        color: #FFF !important;
        font-size: 11px !important;
        cursor: pointer !important;
        outline: none !important;
    }

    .d-dart-filter-select:focus { border-color: #FF9900 !important; }

    .d-dart-checkbox-label {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        font-size: 12px !important;
        color: #CCC !important;
        cursor: pointer !important;
    }

    .d-dart-shippers-list {
        max-height: 350px !important;
        overflow-y: auto !important;
    }

    .d-dart-no-results {
        text-align: center !important;
        padding: 30px !important;
        color: #888 !important;
        font-size: 13px !important;
    }

    .d-dart-shipper-card-settings {
        background: #1a242f !important;
        border-radius: 6px !important;
        margin-bottom: 8px !important;
        border-left: 3px solid #37475A !important;
        overflow: hidden !important;
    }

    .d-dart-shipper-card-settings.status-active { border-left-color: #00ff88 !important; }
    .d-dart-shipper-card-settings.status-inactive { border-left-color: #888 !important; }
    .d-dart-shipper-card-settings.status-error { border-left-color: #ff6b6b !important; }

    .d-dart-shipper-header-settings {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 10px 12px !important;
        cursor: pointer !important;
        transition: background 0.2s ease !important;
    }

    .d-dart-shipper-header-settings:hover { background: rgba(255,153,0,0.1) !important; }

    .d-dart-shipper-info {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
    }

    .d-dart-shipper-status-icon { font-size: 14px !important; }

    .d-dart-shipper-name-settings {
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #FFF !important;
    }

    .d-dart-shipper-summary {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
    }

    .d-dart-shipper-rate, .d-dart-shipper-max {
        font-size: 11px !important;
        color: #888 !important;
    }

    .d-dart-validation-error-badge {
        font-size: 10px !important;
        color: #ff6b6b !important;
        background: rgba(255,107,107,0.15) !important;
        padding: 2px 8px !important;
        border-radius: 4px !important;
    }

    .d-dart-expand-btn {
        background: transparent !important;
        border: none !important;
        color: #888 !important;
        font-size: 12px !important;
        cursor: pointer !important;
        padding: 4px 8px !important;
        transition: color 0.2s ease !important;
    }

    .d-dart-expand-btn:hover { color: #FF9900 !important; }

    .d-dart-shipper-details {
        max-height: 0 !important;
        overflow: hidden !important;
        transition: max-height 0.3s ease, padding 0.3s ease !important;
        background: #232F3E !important;
    }

    .d-dart-shipper-details.expanded {
        max-height: 600px !important;
        padding: 12px !important;
        border-top: 1px solid #37475A !important;
    }

    .d-dart-validation-errors {
        background: rgba(255,107,107,0.1) !important;
        border: 1px solid #ff6b6b !important;
        border-radius: 6px !important;
        padding: 10px !important;
        margin-bottom: 12px !important;
    }

    .d-dart-error-title {
        font-size: 12px !important;
        font-weight: 600 !important;
        color: #ff6b6b !important;
        margin-bottom: 6px !important;
    }

    .d-dart-error-list {
        margin: 0 !important;
        padding-left: 20px !important;
        font-size: 11px !important;
        color: #ff9999 !important;
    }

    .d-dart-error-list li { margin-bottom: 4px !important; }

    .d-dart-details-grid {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 10px !important;
    }

    .d-dart-details-section {
        background: #37475A !important;
        border-radius: 6px !important;
        padding: 10px !important;
    }

    .d-dart-details-title {
        font-size: 10px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        text-transform: uppercase !important;
        margin-bottom: 8px !important;
        padding-bottom: 4px !important;
        border-bottom: 1px solid #485769 !important;
    }

    .d-dart-details-row {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 4px 0 !important;
        font-size: 11px !important;
    }

    .d-dart-details-label { color: #888 !important; }
    .d-dart-details-value { color: #FFF !important; font-weight: 500 !important; }
    .d-dart-details-value.yes { color: #00ff88 !important; }
    .d-dart-details-value.no { color: #ff6b6b !important; }

    /* Detention banner */
    .d-dart-detention-banner {
        background: #232F3E !important;
        border: 1px solid #FF9900 !important;
        border-radius: 8px !important;
        margin-bottom: 10px !important;
        overflow: hidden !important;
    }

    .d-dart-banner-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 10px 12px !important;
        background: linear-gradient(90deg, rgba(255,153,0,0.2), rgba(255,153,0,0.05)) !important;
        border-bottom: 1px solid #37475A !important;
    }

    .d-dart-banner-title {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
    }

    .d-dart-banner-toggle {
        background: transparent !important;
        border: 1px solid #FF9900 !important;
        border-radius: 4px !important;
        color: #FF9900 !important;
        font-size: 11px !important;
        padding: 4px 10px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        font-weight: 600 !important;
    }

    .d-dart-banner-toggle:hover {
        background: #FF9900 !important;
        color: #232F3E !important;
    }

    .d-dart-banner-summary { padding: 12px !important; }

    .d-dart-banner-row {
        display: flex !important;
        align-items: center !important;
        padding: 8px 12px !important;
        background: #37475A !important;
        border-radius: 6px !important;
        margin-bottom: 6px !important;
    }

    .d-dart-banner-row:last-child { margin-bottom: 0 !important; }

    .d-dart-banner-label {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #888 !important;
        width: 90px !important;
        flex-shrink: 0 !important;
    }

    .d-dart-banner-value {
        font-size: 13px !important;
        font-weight: 700 !important;
        flex: 1 !important;
    }

    .d-dart-banner-value.charge-added { color: #00ff88 !important; }
    .d-dart-banner-value.hold-released { color: #4dabf7 !important; }
    .d-dart-banner-value.chargeable { color: #ffd700 !important; }
    .d-dart-banner-value.charge-exists { color: #ffd700 !important; }
    .d-dart-banner-value.pending { color: #888 !important; }
    .d-dart-banner-value.no-charge { color: #ff6b6b !important; }
    .d-dart-banner-value.no-action { color: #888 !important; }
    .d-dart-banner-value.analysis-only { color: #4dabf7 !important; }
    .d-dart-banner-value.hold-created { color: #4dabf7 !important; }

    .d-dart-banner-details {
        max-height: 0 !important;
        overflow: hidden !important;
        transition: max-height 0.3s ease, padding 0.3s ease !important;
        background: #1a242f !important;
    }

    .d-dart-banner-details.expanded {
        max-height: 400px !important;
        padding: 12px !important;
        border-top: 1px solid #37475A !important;
    }

    .d-dart-breakdown-section {
        background: #232F3E !important;
        border-radius: 6px !important;
        padding: 10px 12px !important;
        margin-bottom: 8px !important;
        border: 1px solid #37475A !important;
    }

    .d-dart-breakdown-section:last-child { margin-bottom: 0 !important; }

    .d-dart-breakdown-title {
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        margin-bottom: 8px !important;
        text-transform: uppercase !important;
    }

    .d-dart-breakdown-content {
        font-size: 11px !important;
        color: #ccc !important;
        line-height: 1.6 !important;
    }

    .d-dart-breakdown-line { padding: 2px 0 !important; }

    /* Shipper card */
    .d-dart-shipper-card {
        background: #37475A !important;
        border-radius: 8px !important;
        padding: 10px !important;
        margin-bottom: 10px !important;
        border: 1px solid #485769 !important;
    }

    .d-dart-header-row {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 8px !important;
        padding-bottom: 8px !important;
        border-bottom: 1px solid #485769 !important;
    }

    .d-dart-shipper-name {
        font-size: 14px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
    }

    .d-dart-header-badges {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
    }

    .d-dart-status-badge {
        padding: 4px 10px !important;
        border-radius: 4px !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        color: #FFF !important;
        text-transform: uppercase !important;
    }

    .d-dart-sow-badge {
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        color: #FF9900 !important;
        text-shadow: 0 0 5px rgba(255, 153, 0, 0.5) !important;
        animation: d-dart-glow-pulse 2s ease-in-out infinite !important;
    }

    .d-dart-sow-badge.error {
        color: #ff6b6b !important;
        animation: none !important;
    }

    @keyframes d-dart-glow-pulse {
        0%, 100% { text-shadow: 0 0 5px rgba(255, 153, 0, 0.5) !important; }
        50% { text-shadow: 0 0 15px rgba(255, 153, 0, 0.8) !important; }
    }

    .d-dart-sow-badge:hover {
        color: #FFD700 !important;
        animation: none !important;
    }

    .d-dart-sow-details {
        max-height: 0 !important;
        overflow: hidden !important;
        background: #1a242f !important;
        border-radius: 4px !important;
        transition: all 0.3s ease !important;
        margin-bottom: 0 !important;
    }

    .d-dart-sow-details.expanded {
        max-height: 150px !important;
        margin-bottom: 8px !important;
        padding: 8px 10px !important;
        border: 1px solid #FF9900 !important;
    }

    .d-dart-sow-flex {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px 16px !important;
        align-items: center !important;
    }

    .d-dart-sow-item {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        font-size: 10px !important;
        white-space: nowrap !important;
    }

    .d-dart-sow-item-label { color: #888 !important; }
    .d-dart-sow-item-value { color: #FF9900 !important; font-weight: 600 !important; }
    .d-dart-sow-item-value.warning { color: #ffd700 !important; }
    .d-dart-sow-item-value.success { color: #00ff88 !important; }
    .d-dart-sow-item-value.disabled { color: #ff6b6b !important; }

    .d-dart-id-row {
        display: flex !important;
        margin-bottom: 8px !important;
        border-bottom: 1px solid #485769 !important;
        padding-bottom: 8px !important;
    }

    .d-dart-id-item {
        flex: 1 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 6px 4px !important;
        color: #FEBD69 !important;
        text-decoration: none !important;
        border-right: 1px solid #485769 !important;
        transition: all 0.2s ease !important;
        cursor: pointer !important;
    }

    .d-dart-id-item:last-child { border-right: none !important; }
    .d-dart-id-item:hover { background: rgba(255,153,0,0.1) !important; }
    .d-dart-id-item:hover .d-dart-id-value { color: #FF9900 !important; text-decoration: underline !important; }

    .d-dart-id-content {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 2px !important;
        min-width: 0 !important;
    }

    .d-dart-id-label {
        font-size: 9px !important;
        font-weight: 600 !important;
        color: #888 !important;
        text-transform: uppercase !important;
    }

    .d-dart-id-value {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        color: #FEBD69 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
    }

    .d-dart-id-icon { font-size: 14px !important; flex-shrink: 0 !important; }

    .d-dart-lane-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 8px 10px !important;
        background: #1a242f !important;
        border-radius: 6px !important;
        margin-bottom: 8px !important;
        gap: 8px !important;
    }

    .d-dart-lane-origin, .d-dart-lane-dest {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #FFF !important;
        flex-shrink: 1 !important;
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        max-width: 38% !important;
    }

    .d-dart-lane-arrow-container {
        flex: 1 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        overflow: hidden !important;
        position: relative !important;
        min-width: 80px !important;
    }

    .d-dart-lane-arrow-track {
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }

    .d-dart-arrow-static {
        color: #FF9900 !important;
        font-size: 12px !important;
        letter-spacing: -1px !important;
        opacity: 0.6 !important;
    }

    .d-dart-arrow-moving {
        position: absolute !important;
        color: #FFD700 !important;
        font-size: 14px !important;
        font-weight: bold !important;
        animation: d-dart-arrow-slide 1s linear infinite !important;
        text-shadow: 0 0 8px rgba(255,215,0,0.8) !important;
    }

    @keyframes d-dart-arrow-slide {
        0% { left: 0%; opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { left: 100%; opacity: 0; }
    }

    .d-dart-holds-row {
        display: flex !important;
        align-items: center !important;
        padding: 8px 10px !important;
        background: #1a242f !important;
        border-radius: 6px !important;
    }

    .d-dart-holds-label {
        flex: 0 0 20% !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #888 !important;
        text-transform: uppercase !important;
    }

    .d-dart-hold-item {
        flex: 0 0 40% !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        text-align: center !important;
    }

    .d-dart-hold-item.has-hold { color: #00ff88 !important; }
    .d-dart-hold-item.no-hold { color: #ff6b6b !important; }

    /* Stop card */
    .d-dart-section-title {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #FF9900 !important;
        text-transform: uppercase !important;
        letter-spacing: 1px !important;
        margin-bottom: 8px !important;
        padding-bottom: 4px !important;
        border-bottom: 1px solid #37475A !important;
    }

    .d-dart-stop-card {
        background: #37475A !important;
        border-radius: 8px !important;
        padding: 10px !important;
        margin-bottom: 6px !important;
        border-left: 3px solid #FF9900 !important;
    }

    .d-dart-stop-card:last-child { margin-bottom: 0 !important; }

    .d-dart-stop-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 10px !important;
        padding-bottom: 8px !important;
        border-bottom: 1px solid #485769 !important;
    }

    .d-dart-stop-title {
        font-size: 10px !important;
        font-weight: 700 !important;
        color: #FFF !important;
    }

    .d-dart-stop-badges {
        display: flex !important;
        gap: 6px !important;
    }

    .d-dart-stop-badge {
        font-size: 10px !important;
        padding: 3px 8px !important;
        border-radius: 4px !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
    }

    .d-dart-stop-badge.pickup { background: rgba(255,153,0,0.25) !important; color: #FF9900 !important; }
    .d-dart-stop-badge.dropoff { background: rgba(0,255,136,0.2) !important; color: #00ff88 !important; }
    .d-dart-stop-badge.load-type { background: #485769 !important; color: #FFF !important; }

    .d-dart-timestamp-boxes {
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
    }

    .d-dart-ts-box {
        display: flex !important;
        width: 100% !important;
        background: #1a242f !important;
        border-radius: 6px !important;
        overflow: hidden !important;
        border: 1px solid #485769 !important;
    }

    .d-dart-ts-col {
        padding: 8px 10px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
        border-right: 1px solid #485769 !important;
    }

    .d-dart-ts-col:last-child { border-right: none !important; }

    .d-dart-ts-col.planned { width: 35% !important; }
    .d-dart-ts-col.actual { width: 35% !important; }
    .d-dart-ts-col.delay {
        width: 30% !important;
        text-align: center !important;
        justify-content: center !important;
        align-items: center !important;
    }

    .d-dart-ts-col.delay.early { background: rgba(0,255,136,0.15) !important; }
    .d-dart-ts-col.delay.late { background: rgba(255,107,107,0.15) !important; }

    .d-dart-ts-col-label {
        font-size: 10px !important;
        font-weight: 600 !important;
        color: #888 !important;
        text-transform: uppercase !important;
    }

    .d-dart-ts-col-value {
        font-size: 13px !important;
        font-weight: 700 !important;
        color: #FFF !important;
    }

    .d-dart-ts-col.delay.early .d-dart-ts-col-value { color: #00ff88 !important; }
    .d-dart-ts-col.delay.late .d-dart-ts-col-value { color: #ff6b6b !important; }

    .d-dart-borrowed-indicator {
        font-size: 9px !important;
        color: #ffd43b !important;
        background: rgba(255,212,59,0.15) !important;
        padding: 2px 6px !important;
        border-radius: 3px !important;
        margin-top: 4px !important;
        font-style: italic !important;
    }

    /* Progress */
    .d-dart-progress {
        background: #232F3E !important;
        border-radius: 8px !important;
        padding: 15px !important;
        margin-bottom: 12px !important;
    }

    .d-dart-progress-title {
        font-size: 18px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        margin-bottom: 12px !important;
        text-align: center !important;
    }

    .d-dart-progress-steps {
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
    }

    .d-dart-step {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 8px 12px !important;
        background: #37475A !important;
        border-radius: 6px !important;
        font-size: 13px !important;
        transition: all 0.3s ease !important;
    }

    .d-dart-step.pending { opacity: 0.5 !important; }
    .d-dart-step.active {
        background: #485769 !important;
        border-left: 3px solid #FF9900 !important;
        animation: d-dart-pulse 1s infinite !important;
    }
    .d-dart-step.completed {
        background: rgba(0,255,136,0.1) !important;
        border-left: 3px solid #00ff88 !important;
    }
    .d-dart-step.error {
        background: rgba(255,107,107,0.1) !important;
        border-left: 3px solid #ff6b6b !important;
    }

    .d-dart-step-icon { font-size: 16px !important; width: 24px !important; text-align: center !important; }
    .d-dart-step-text { flex: 1 !important; font-weight: 500 !important; }
    .d-dart-step-status { font-size: 10px !important; color: #888 !important; }

    .d-dart-enhanced-progress {
        background: #232F3E !important;
        border-radius: 8px !important;
        padding: 15px !important;
    }

    .d-dart-progress-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 15px !important;
    }

    .d-dart-progress-controls {
        display: flex !important;
        gap: 6px !important;
    }

    .d-dart-control-btn {
        background: #37475A !important;
        border: 1px solid #485769 !important;
        border-radius: 6px !important;
        padding: 6px 10px !important;
        font-size: 14px !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        color: #FFF !important;
    }

    .d-dart-control-btn:hover {
        background: #485769 !important;
        border-color: #FF9900 !important;
    }

    .d-dart-control-btn.cancel:hover {
        background: rgba(255,107,107,0.2) !important;
        border-color: #ff6b6b !important;
    }

    .d-dart-progress-stats {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 8px !important;
        margin-bottom: 15px !important;
    }

    .d-dart-stat {
        background: #37475A !important;
        border-radius: 6px !important;
        padding: 10px 8px !important;
        text-align: center !important;
    }

    .d-dart-stat.success .d-dart-stat-value { color: #00ff88 !important; }
    .d-dart-stat.error .d-dart-stat-value { color: #ff6b6b !important; }

    .d-dart-stat-value {
        display: block !important;
        font-size: 22px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
    }

    .d-dart-stat-label {
        font-size: 9px !important;
        color: #888 !important;
        text-transform: uppercase !important;
    }

    .d-dart-progress-bar-container {
        height: 8px !important;
        background: #37475A !important;
        border-radius: 4px !important;
        overflow: hidden !important;
        margin-bottom: 10px !important;
    }

    .d-dart-progress-bar {
        height: 100% !important;
        background: linear-gradient(90deg, #FF9900, #00ff88) !important;
        border-radius: 4px !important;
        transition: width 0.3s ease !important;
    }

    .d-dart-progress-info {
        text-align: center !important;
        margin-bottom: 10px !important;
    }

    .d-dart-progress-status {
        color: #FFF !important;
        font-size: 12px !important;
        margin-bottom: 4px !important;
    }

    .d-dart-progress-eta {
        color: #888 !important;
        font-size: 11px !important;
    }

    .d-dart-progress-footer {
        display: flex !important;
        justify-content: space-between !important;
        font-size: 10px !important;
        color: #666 !important;
    }

    .d-dart-progress-token .token-ok { color: #00ff88 !important; }
    .d-dart-progress-token .token-warning { color: #ffd700 !important; }
    .d-dart-progress-token .token-error { color: #ff6b6b !important; }

    /* Batch table */
    .d-dart-batch-summary {
        display: grid !important;
        grid-template-columns: repeat(6, 1fr) !important;
        gap: 6px !important;
        margin-bottom: 10px !important;
    }

    .d-dart-batch-stat {
        background: #37475A !important;
        border-radius: 6px !important;
        padding: 8px 4px !important;
        text-align: center !important;
        font-size: 10px !important;
        font-weight: 600 !important;
    }

    .d-dart-batch-stat.success { color: #00ff88 !important; }
    .d-dart-batch-stat.recovered { color: #FF9900 !important; }
    .d-dart-batch-stat.released { color: #4dabf7 !important; }
    .d-dart-batch-stat.analysis { color: #4dabf7 !important; }
    .d-dart-batch-stat.pending { color: #ffd700 !important; }
    .d-dart-batch-stat.error { color: #ff6b6b !important; }
    .d-dart-batch-stat.hold-created { color: #4dabf7 !important; }

    .d-dart-batch-table-container {
        max-height: 300px !important;
        overflow-y: auto !important;
        margin-bottom: 10px !important;
        border-radius: 6px !important;
        border: 1px solid #37475A !important;
    }

    .d-dart-batch-table {
        width: 100% !important;
        border-collapse: collapse !important;
        font-size: 10px !important;
    }

    .d-dart-batch-table th {
        background: #37475A !important;
        color: #888 !important;
        padding: 6px 4px !important;
        text-align: left !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        position: sticky !important;
        top: 0 !important;
        font-size: 9px !important;
    }

    .d-dart-batch-table td {
        padding: 5px 4px !important;
        border-bottom: 1px solid #37475A !important;
        color: #FFF !important;
    }

    .d-dart-batch-table tr.success td { background: rgba(0,255,136,0.05) !important; }
    .d-dart-batch-table tr.pending td { background: rgba(255,215,0,0.05) !important; }
    .d-dart-batch-table tr.error td { background: rgba(255,107,107,0.05) !important; }
    .d-dart-batch-table tr.recovered td { background: rgba(255,153,0,0.05) !important; }
    .d-dart-batch-table tr.analysis td { background: rgba(77,171,247,0.05) !important; }
    .d-dart-batch-table tr.hold-created td { background: rgba(77,171,247,0.05) !important; }

    .d-dart-order-cell { color: #FEBD69 !important; }

    .d-dart-download-buttons {
        display: flex !important;
        gap: 8px !important;
        justify-content: center !important;
    }

    .d-dart-download-btn {
        padding: 8px 16px !important;
        background: #37475A !important;
        border: 1px solid #485769 !important;
        border-radius: 6px !important;
        color: #FFF !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-download-btn:hover {
        background: #485769 !important;
        border-color: #FF9900 !important;
    }

    /* Error display */
    .d-dart-error {
        background: rgba(255,107,107,0.15) !important;
        border: 1px solid #ff6b6b !important;
        border-radius: 8px !important;
        padding: 20px !important;
        color: #ff6b6b !important;
        text-align: center !important;
    }

    .d-dart-error-icon { font-size: 32px !important; margin-bottom: 8px !important; }
    .d-dart-error-title { font-size: 16px !important; font-weight: 700 !important; margin-bottom: 8px !important; }
    .d-dart-error-message { font-size: 12px !important; line-height: 1.4 !important; }

    .d-dart-empty {
        text-align: center !important;
        padding: 20px !important;
        color: #888 !important;
        font-size: 13px !important;
    }

    /* SOW error */
    .d-dart-sow-error {
        background: rgba(255,107,107,0.1) !important;
        border: 1px solid #ff6b6b !important;
        border-radius: 8px !important;
        padding: 20px !important;
        text-align: center !important;
        margin-bottom: 12px !important;
    }

    .d-dart-sow-error-icon { font-size: 40px !important; margin-bottom: 10px !important; }
    .d-dart-sow-error-title { font-size: 16px !important; font-weight: 700 !important; color: #ff6b6b !important; margin-bottom: 8px !important; }
    .d-dart-sow-error-message { font-size: 12px !important; color: #ccc !important; margin-bottom: 15px !important; }
    .d-dart-sow-error-instructions { font-size: 11px !important; color: #888 !important; text-align: left !important; margin-bottom: 15px !important; padding: 10px !important; background: #232F3E !important; border-radius: 6px !important; }
    .d-dart-sow-error-instructions p { margin: 5px 0 !important; }

    .d-dart-sow-login-btn {
        display: inline-block !important;
        padding: 10px 20px !important;
        background: #37475A !important;
        color: #FFF !important;
        text-decoration: none !important;
        border-radius: 6px !important;
        font-weight: 600 !important;
        margin-bottom: 10px !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-sow-login-btn:hover { background: #485769 !important; }

    .d-dart-sow-retry-btn {
        display: block !important;
        width: 100% !important;
        padding: 10px !important;
        background: #FF9900 !important;
        border: none !important;
        border-radius: 6px !important;
        color: #232F3E !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-sow-retry-btn:hover { background: #FEBD69 !important; }

    /* Approval popup */
    #d-dart-approval-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0,0,0,0.7) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483650 !important;
        animation: d-dart-fadeIn 0.2s ease !important;
    }

    @keyframes d-dart-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .d-dart-approval-popup {
        background: #232F3E !important;
        border: 2px solid #FF9900 !important;
        border-radius: 12px !important;
        width: 420px !important;
        max-width: 90vw !important;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
        animation: d-dart-popupSlide 0.3s ease !important;
    }

    @keyframes d-dart-popupSlide {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }

    .d-dart-approval-header {
        background: linear-gradient(90deg, #FF9900, #E88B00) !important;
        padding: 12px 16px !important;
        border-radius: 10px 10px 0 0 !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
    }

    .d-dart-approval-title {
        font-size: 16px !important;
        font-weight: 700 !important;
        color: #232F3E !important;
    }

    .d-dart-approval-timer {
        font-size: 14px !important;
        font-weight: 700 !important;
        color: #232F3E !important;
        background: rgba(255,255,255,0.3) !important;
        padding: 4px 10px !important
        border-radius: 20px !important;
        transition: all 0.3s ease !important;
    }

    .d-dart-approval-timer.warning { background: rgba(255,200,0,0.5) !important; color: #000 !important; }
    .d-dart-approval-timer.critical {
        background: rgba(255,100,100,0.8) !important;
        color: #FFF !important;
        animation: d-dart-pulse 0.5s infinite !important;
    }

    .d-dart-approval-body { padding: 20px !important; }

    .d-dart-approval-order-id, .d-dart-approval-shipper, .d-dart-approval-charge-confirm {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 8px 12px !important;
        background: #37475A !important;
        border-radius: 6px !important;
        margin-bottom: 10px !important;
    }

    .d-dart-approval-label { font-size: 12px !important; color: #888 !important; }
    .d-dart-approval-value { font-size: 14px !important; font-weight: 600 !important; color: #FEBD69 !important; }

    .d-dart-approval-charge-info {
        background: #1a242f !important;
        border: 1px solid #485769 !important;
        border-radius: 8px !important;
        padding: 15px !important;
        margin-bottom: 15px !important;
    }

    .d-dart-approval-charge-title {
        font-size: 12px !important;
        color: #888 !important;
        margin-bottom: 10px !important;
        text-align: center !important;
    }

    .d-dart-approval-charge-details { margin-bottom: 10px !important; }

    .d-dart-approval-stop-line {
        font-size: 13px !important;
        color: #FFF !important;
        padding: 6px 0 !important;
        border-bottom: 1px solid #37475A !important;
    }

    .d-dart-approval-stop-line:last-child { border-bottom: none !important; }
    .d-dart-approval-stop-line strong { color: #ffd700 !important; }

    .d-dart-approval-total {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding-top: 10px !important;
        border-top: 2px solid #FF9900 !important;
        margin-top: 10px !important;
    }

    .d-dart-approval-total-label { font-size: 14px !important; font-weight: 600 !important; color: #FFF !important; }
    .d-dart-approval-total-value { font-size: 20px !important; font-weight: 700 !important; color: #ffd700 !important; }

    .d-dart-approval-question {
        font-size: 14px !important;
        color: #FFF !important;
        text-align: center !important;
        margin-bottom: 5px !important;
    }

    .d-dart-approval-buttons {
        display: flex !important;
        gap: 10px !important;
        padding: 15px 20px 20px !important;
        justify-content: center !important;
    }

    .d-dart-approval-btn {
        padding: 12px 24px !important;
        border: none !important;
        border-radius: 8px !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        min-width: 100px !important;
    }

    .d-dart-approval-btn:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
    }

    .d-dart-approval-btn.yes { background: #00ff88 !important; color: #232F3E !important; }
    .d-dart-approval-btn.yes:hover { background: #00cc6a !important; }
    .d-dart-approval-btn.no { background: #ff6b6b !important; color: #FFF !important; }
    .d-dart-approval-btn.no:hover { background: #ff4444 !important; }
    .d-dart-approval-btn.skip { background: #37475A !important; color: #FFF !important; border: 1px solid #485769 !important; }
    .d-dart-approval-btn.skip:hover { background: #485769 !important; border-color: #FF9900 !important; }
    .d-dart-approval-btn.submit { background: #FF9900 !important; color: #232F3E !important; }
    .d-dart-approval-btn.submit:hover { background: #FEBD69 !important; }
    .d-dart-approval-btn.cancel { background: #37475A !important; color: #FFF !important; }
    .d-dart-approval-btn.cancel:hover { background: #485769 !important; }

    .d-dart-approval-auth-section { margin-top: 10px !important; }

    .d-dart-approval-auth-label {
        display: block !important;
        font-size: 12px !important;
        color: #888 !important;
        margin-bottom: 8px !important;
    }

    .d-dart-approval-auth-input {
        width: 100% !important;
        padding: 12px !important;
        border: 2px solid #37475A !important;
        border-radius: 6px !important;
        background: #1a242f !important;
        color: #FFF !important;
        font-size: 14px !important;
        outline: none !important;
        transition: border-color 0.2s ease !important;
    }

    .d-dart-approval-auth-input:focus { border-color: #FF9900 !important; }
    .d-dart-approval-auth-input.error { border-color: #ff6b6b !important; }
    .d-dart-approval-auth-input::placeholder { color: #666 !important; }

    .d-dart-approval-auth-error {
        color: #ff6b6b !important;
        font-size: 11px !important;
        margin-top: 5px !important;
        min-height: 16px !important;
    }

    /* Resume popup */
    #d-dart-resume-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0,0,0,0.7) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483650 !important;
    }

    .d-dart-resume-popup {
        background: #232F3E !important;
        border: 2px solid #FF9900 !important;
        border-radius: 12px !important;
        padding: 25px !important;
        text-align: center !important;
        max-width: 400px !important;
    }

    .d-dart-resume-title {
        font-size: 18px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        margin-bottom: 15px !important;
    }

    .d-dart-resume-info {
        color: #FFF !important;
        margin-bottom: 20px !important;
        line-height: 1.6 !important;
    }

    .d-dart-resume-buttons {
        display: flex !important;
        gap: 10px !important;
        justify-content: center !important;
    }

    .d-dart-resume-btn {
        padding: 10px 20px !important;
        border: none !important;
        border-radius: 6px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-resume-btn:hover { transform: translateY(-2px) !important; }
    .d-dart-resume-btn.yes { background: #00ff88 !important; color: #232F3E !important; }
    .d-dart-resume-btn.no { background: #37475A !important; color: #FFF !important; }

    /* Copy popup */
    .d-dart-copy-popup {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: #00ff88 !important;
        color: #232F3E !important;
        padding: 15px 30px !important;
        border-radius: 10px !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        z-index: 2147483649 !important;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4) !important;
        animation: d-dart-pop 0.3s ease !important;
    }

    @keyframes d-dart-pop {
        from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }

    /* Scrollbars */
    #d-dart-body::-webkit-scrollbar { width: 5px !important; }
    #d-dart-body::-webkit-scrollbar-track { background: #1a242f !important; }
    #d-dart-body::-webkit-scrollbar-thumb { background: #37475A !important; border-radius: 3px !important; }
    #d-dart-body::-webkit-scrollbar-thumb:hover { background: #FF9900 !important; }

    .d-dart-batch-table-container::-webkit-scrollbar { width: 4px !important; }
    .d-dart-batch-table-container::-webkit-scrollbar-track { background: #1a242f !important; }
    .d-dart-batch-table-container::-webkit-scrollbar-thumb { background: #37475A !important; border-radius: 2px !important; }

    .d-dart-shippers-list::-webkit-scrollbar { width: 4px !important; }
    .d-dart-shippers-list::-webkit-scrollbar-track { background: #1a242f !important; }
    .d-dart-shippers-list::-webkit-scrollbar-thumb { background: #485769 !important; border-radius: 2px !important; }

    .d-dart-settings-body::-webkit-scrollbar { width: 5px !important; }
    .d-dart-settings-body::-webkit-scrollbar-track { background: #232F3E !important; }
    .d-dart-settings-body::-webkit-scrollbar-thumb { background: #485769 !important; border-radius: 3px !important; }

    /* Inline Settings Panel Styles */
    .d-dart-settings-inline {
        padding: 0 !important;
    }

    .d-dart-settings-inline-header {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 12px !important;
        background: linear-gradient(90deg, #FF9900, #E88B00) !important;
        margin: -12px -12px 12px -12px !important;
        border-radius: 0 !important;
    }

    .d-dart-back-btn {
        background: rgba(0,0,0,0.2) !important;
        border: none !important;
        color: #232F3E !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        padding: 6px 12px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    .d-dart-back-btn:hover {
        background: rgba(0,0,0,0.3) !important;
        transform: translateX(-2px) !important;
    }

    .d-dart-back-btn:focus {
        outline: 2px solid #232F3E !important;
        outline-offset: 2px !important;
    }

    .d-dart-settings-inline-title {
        font-size: 16px !important;
        font-weight: 700 !important;
        color: #232F3E !important;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     * UPDATE MODAL STYLES (NEW)
     * ═══════════════════════════════════════════════════════════════════════════ */

    #d-dart-update-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.95) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: 'Amazon Ember', 'Segoe UI', Tahoma, sans-serif !important;
        animation: d-dart-update-fadeIn 0.3s ease !important;
    }

    @keyframes d-dart-update-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .d-dart-update-modal {
        background: linear-gradient(145deg, #232F3E 0%, #1a242f 100%) !important;
        border: 3px solid #FF9900 !important;
        border-radius: 16px !important;
        padding: 40px !important;
        max-width: 480px !important;
        width: 90vw !important;
        text-align: center !important;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 153, 0, 0.2) !important;
        animation: d-dart-update-slideIn 0.4s ease !important;
    }

    @keyframes d-dart-update-slideIn {
        from {
            opacity: 0;
            transform: translateY(-30px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    .d-dart-update-modal.offline {
        border-color: #ff6b6b !important;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 107, 107, 0.2) !important;
    }

    .d-dart-update-icon {
        font-size: 64px !important;
        margin-bottom: 20px !important;
        display: block !important;
    }

    .d-dart-update-icon.checking {
        animation: d-dart-update-spin 1s linear infinite !important;
    }

    .d-dart-update-icon.upgrade {
        animation: d-dart-update-bounce 1s ease infinite !important;
    }

    .d-dart-update-icon.downgrade {
        animation: d-dart-update-bounce 1s ease infinite !important;
    }

    .d-dart-update-icon.offline {
        animation: d-dart-update-shake 0.5s ease infinite !important;
    }

    @keyframes d-dart-update-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    @keyframes d-dart-update-bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
    }

    @keyframes d-dart-update-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }

    .d-dart-update-title {
        font-size: 24px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        margin-bottom: 15px !important;
        text-shadow: 0 2px 10px rgba(255, 153, 0, 0.3) !important;
    }

    .d-dart-update-modal.offline .d-dart-update-title {
        color: #ff6b6b !important;
        text-shadow: 0 2px 10px rgba(255, 107, 107, 0.3) !important;
    }

    .d-dart-update-body {
        font-size: 14px !important;
        color: #CCC !important;
        margin-bottom: 25px !important;
        line-height: 1.6 !important;
    }

    .d-dart-update-versions {
        background: #37475A !important;
        border-radius: 10px !important;
        padding: 20px !important;
        margin-bottom: 25px !important;
    }

    .d-dart-update-version-row {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 8px 0 !important;
        border-bottom: 1px solid #485769 !important;
    }

    .d-dart-update-version-row:last-child {
        border-bottom: none !important;
    }

    .d-dart-update-version-label {
        font-size: 13px !important;
        color: #888 !important;
        font-weight: 500 !important;
    }

    .d-dart-update-version-value {
        font-size: 16px !important;
        font-weight: 700 !important;
    }

    .d-dart-update-version-value.local {
        color: #ff6b6b !important;
    }

    .d-dart-update-version-value.remote {
        color: #00ff88 !important;
    }

    .d-dart-update-version-value.date {
        color: #4dabf7 !important;
        font-size: 13px !important;
    }

    .d-dart-update-notes {
        background: #1a242f !important;
        border: 1px solid #485769 !important;
        border-radius: 8px !important;
        padding: 15px !important;
        margin-bottom: 25px !important;
        text-align: left !important;
        max-height: 150px !important;
        overflow-y: auto !important;
    }

    .d-dart-update-notes-title {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #FF9900 !important;
        text-transform: uppercase !important;
        margin-bottom: 10px !important;
        letter-spacing: 0.5px !important;
    }

    .d-dart-update-notes-list {
        margin: 0 !important;
        padding-left: 20px !important;
        font-size: 12px !important;
        color: #CCC !important;
        line-height: 1.8 !important;
    }

    .d-dart-update-notes-list li {
        margin-bottom: 5px !important;
    }

    .d-dart-update-notes::-webkit-scrollbar {
        width: 4px !important;
    }

    .d-dart-update-notes::-webkit-scrollbar-track {
        background: #232F3E !important;
    }

    .d-dart-update-notes::-webkit-scrollbar-thumb {
        background: #485769 !important;
        border-radius: 2px !important;
    }

    .d-dart-update-button {
        display: inline-block !important;
        padding: 16px 40px !important;
        background: linear-gradient(135deg, #FF9900 0%, #E88B00 100%) !important;
        border: none !important;
        border-radius: 10px !important;
        color: #232F3E !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
        box-shadow: 0 4px 15px rgba(255, 153, 0, 0.4) !important;
        text-transform: uppercase !important;
        letter-spacing: 1px !important;
    }

    .d-dart-update-button:hover {
        background: linear-gradient(135deg, #FEBD69 0%, #FF9900 100%) !important;
        transform: translateY(-3px) !important;
        box-shadow: 0 8px 25px rgba(255, 153, 0, 0.5) !important;
    }

    .d-dart-update-button:active {
        transform: translateY(-1px) !important;
    }

    .d-dart-update-button.retry {
        background: linear-gradient(135deg, #37475A 0%, #485769 100%) !important;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3) !important;
    }

    .d-dart-update-button.retry:hover {
        background: linear-gradient(135deg, #485769 0%, #5a6b7d 100%) !important;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4) !important;
    }

    .d-dart-update-button:disabled {
        opacity: 0.6 !important;
        cursor: not-allowed !important;
        transform: none !important;
    }

    .d-dart-update-instructions {
        font-size: 11px !important;
        color: #666 !important;
        margin-top: 20px !important;
        line-height: 1.5 !important;
    }

    .d-dart-update-error-details {
        background: rgba(255, 107, 107, 0.1) !important;
        border: 1px solid rgba(255, 107, 107, 0.3) !important;
        border-radius: 8px !important;
        padding: 15px !important;
        margin-bottom: 25px !important;
    }

    .d-dart-update-error-label {
        font-size: 11px !important;
        color: #888 !important;
        text-transform: uppercase !important;
        display: block !important;
        margin-bottom: 5px !important;
    }

    .d-dart-update-error-message {
        font-size: 13px !important;
        color: #ff6b6b !important;
        font-weight: 500 !important;
    }

    .d-dart-update-spinner {
        width: 40px !important;
        height: 40px !important;
        border: 4px solid #37475A !important;
        border-top-color: #FF9900 !important;
        border-radius: 50% !important;
        margin: 20px auto !important;
        animation: d-dart-update-spin 1s linear infinite !important;
    }
`;
    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 32: UI CONTROLLER
     * ═══════════════════════════════════════════════════════════════════════════ */

 const UIController = (() => {
    let dom = null;
    let toastTimeout = null;
    let dragState = { isDragging: false, offsetX: 0, offsetY: 0 };
    let boundHandlers = new Map();
    let debouncedAnalyze = null;
    let debouncedSearch = null;

    /**
     * Inject styles
     */
    const injectStyles = () => {
        GM_addStyle(Styles);
    };

    /**
     * Create DOM elements
     */
    const createDOM = () => {
        const container = document.createElement('div');
        container.id = 'd-dart';
        container.setAttribute('role', 'application');
        container.setAttribute('aria-label', Messages.ACCESSIBILITY.PANEL_LABEL);

        container.innerHTML = `
            <div id="d-dart-minimized-icon" title="Expand D-DART" role="button" tabindex="0" aria-label="${Messages.ACCESSIBILITY.EXPAND_PANEL}">🚛</div>
            <div id="d-dart-header">
                <h3>
                    🚛 D-DART
                    <span class="d-dart-version-badge">v${CONFIG.VERSION}</span>
                    <div class="d-dart-status-indicators">
                        <span class="d-dart-token-indicator" id="d-dart-token-indicator" title="Token status">🔐...</span>
                        <span class="d-dart-sow-indicator" id="d-dart-sow-indicator" title="SOW status">📋...</span>
                    </div>
                </h3>
                <div class="d-dart-header-right">
                    <span class="d-dart-signature">${CONFIG.AUTHOR}</span>
                    <div class="d-dart-header-buttons">
                        <button class="d-dart-header-btn" id="d-dart-settings-btn" title="Settings" aria-label="${Messages.ACCESSIBILITY.OPEN_SETTINGS}">⚙️</button>
                        <button class="d-dart-header-btn" id="d-dart-reset-btn" title="Reset form" aria-label="${Messages.ACCESSIBILITY.RESET_FORM}">↻</button>
                        <button class="d-dart-header-btn" id="d-dart-debug-btn" title="Copy Debug Log" aria-label="${Messages.ACCESSIBILITY.COPY_DEBUG}">🔍</button>
                        <button class="d-dart-header-btn" id="d-dart-toggle" title="Minimize" aria-label="${Messages.ACCESSIBILITY.MINIMIZE_PANEL}">−</button>
                    </div>
                </div>
            </div>
            <div id="d-dart-body">
                <div class="d-dart-input-group">
                    <input type="text" class="d-dart-input" id="d-dart-order-id"
                           placeholder="Enter Order ID(s) - supports ${CONFIG.BATCH.MAX_ORDERS_PER_SESSION}+ orders"
                           autocomplete="off" spellcheck="false"
                           aria-label="${Messages.ACCESSIBILITY.ORDER_INPUT}"
                           aria-describedby="d-dart-input-hint">
                    <span id="d-dart-input-hint" class="d-dart-visually-hidden">
                        Enter one or more order IDs separated by commas, spaces, or new lines
                    </span>
                    <button class="d-dart-btn" id="d-dart-analyze-btn" aria-label="${Messages.ACCESSIBILITY.ANALYZE_ORDERS}">Analyze</button>
                </div>
                <div id="d-dart-results-container" role="region" aria-label="${Messages.ACCESSIBILITY.RESULTS_REGION}" aria-live="polite"></div>
            </div>
        `;
        document.body.appendChild(container);

        const toast = document.createElement('div');
        toast.className = 'd-dart-toast';
        toast.id = 'd-dart-toast';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
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

    /**
     * Setup event listeners
     */
    const setupEventListeners = () => {
        dom.toggle.addEventListener('click', () => setMinimized(true));

        dom.minimizedIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            setMinimized(false);
        });

        dom.minimizedIcon.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMinimized(false);
            }
        });

        dom.container.addEventListener('click', (e) => {
            if (AppState.get('isMinimized') && e.target === dom.container) {
                setMinimized(false);
            }
        });

        dom.reset.addEventListener('click', resetForm);
        dom.settings.addEventListener('click', openSettings);

        dom.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !AppState.get('isProcessing')) {
                debouncedAnalyze();
            }
        });

        dom.input.addEventListener('input', () => {
            dom.input.classList.remove('error');
            dom.input.removeAttribute('aria-invalid');
        });

        dom.analyzeBtn.addEventListener('click', () => {
            if (!AppState.get('isProcessing')) {
                debouncedAnalyze();
            }
        });

        dom.debugBtn.addEventListener('click', copyDebugLog);

        dom.results.addEventListener('click', handleResultsClick);

        setupDragging();

        if (CONFIG.FEATURES.KEYBOARD_SHORTCUTS) {
            setupKeyboardShortcuts();
        }
    };

    /**
     * Handle results container clicks
     * @param {Event} e
     */
    const handleResultsClick = (e) => {
        const toggleEl = e.target.closest('[data-toggle-target]');
        if (toggleEl) {
            const target = document.getElementById(toggleEl.dataset.toggleTarget);
            if (target) {
                const isExpanded = target.classList.toggle('expanded');
                toggleEl.setAttribute('aria-expanded', isExpanded);
                target.setAttribute('aria-hidden', !isExpanded);
            }
            return;
        }

        if (e.target.id === 'd-dart-download-csv') {
            downloadCSV();
            return;
        }
        if (e.target.id === 'd-dart-download-txt') {
            downloadTXT();
            return;
        }
        if (e.target.id === 'd-dart-sow-retry') {
            SOWConfigManager.fetch();
            return;
        }

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
            if (confirm('Are you sure you want to cancel? Progress will be saved.')) {
                BatchProcessor.cancel();
            }
            return;
        }
    };

    /**
     * Setup keyboard shortcuts
     */
    const setupKeyboardShortcuts = () => {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                switch (e.code) {
                    case CONFIG.KEYBOARD.TOGGLE_MINIMIZE:
                        e.preventDefault();
                        setMinimized(!AppState.get('isMinimized'));
                        break;
                    case CONFIG.KEYBOARD.SETTINGS:
                        e.preventDefault();
                        if (AppState.get('isSettingsOpen')) {
                            closeSettings();
                        } else {
                            openSettings();
                        }
                        break;
                    case CONFIG.KEYBOARD.DEBUG:
                        e.preventDefault();
                        copyDebugLog();
                        break;
                }
            }
        });
    };

    /**
     * Setup dragging
     */
    const setupDragging = () => {
        const startDrag = (e) => {
            const ignoredSelectors = [
                '.d-dart-header-buttons', '.d-dart-input', '.d-dart-btn',
                '.d-dart-download-btn', '.d-dart-debug-btn', '.d-dart-banner-toggle',
                '.d-dart-sow-badge', '.d-dart-id-item', '[data-toggle-target]', 'a',
                '.d-dart-control-btn', '.d-dart-sow-retry-btn', '.d-dart-sow-login-btn',
                '.d-dart-back-btn'
            ];

            for (const selector of ignoredSelectors) {
                if (e.target.closest(selector)) return;
            }

            dragState.isDragging = true;
            dom.container.classList.add('dragging');

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
                let newX = clientX - dragState.offsetX;
                let newY = clientY - dragState.offsetY;

                const maxX = window.innerWidth - dom.container.offsetWidth;
                const maxY = window.innerHeight - dom.container.offsetHeight;

                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));

                dom.container.style.setProperty('left', `${newX}px`, 'important');
                dom.container.style.setProperty('top', `${newY}px`, 'important');
                dom.container.style.setProperty('right', 'auto', 'important');
            });
        };

        const endDrag = () => {
            dragState.isDragging = false;
            dom.container.classList.remove('dragging');
        };

        boundHandlers.set('moveDrag', moveDrag);
        boundHandlers.set('endDrag', endDrag);

        dom.header.addEventListener('mousedown', startDrag);
        dom.container.addEventListener('mousedown', (e) => {
            if (AppState.get('isMinimized')) startDrag(e);
        });
        document.addEventListener('mousemove', moveDrag);
        document.addEventListener('mouseup', endDrag);

        dom.header.addEventListener('touchstart', startDrag, { passive: false });
        dom.container.addEventListener('touchstart', (e) => {
            if (AppState.get('isMinimized')) startDrag(e);
        }, { passive: false });
        document.addEventListener('touchmove', moveDrag, { passive: false });
        document.addEventListener('touchend', endDrag);
    };

    /**
     * Setup state subscriptions
     */
    const setupStateSubscriptions = () => {
        AppState.subscribe('isProcessing', (isProcessing) => {
            dom.analyzeBtn.disabled = isProcessing || !SOWConfigManager.isLoaded();
            dom.analyzeBtn.textContent = isProcessing ? 'Processing...' : 'Analyze';
            dom.analyzeBtn.setAttribute('aria-busy', isProcessing);
            dom.analyzeBtn.classList.toggle('loading', isProcessing);
            dom.input.disabled = isProcessing;
        });

        AppState.subscribe('isMinimized', updateMinimizedState);

        AppState.subscribe('sowStatus', () => {
            updateSOWIndicator();
            updateAnalyzeButtonState();
        });
    };

    /**
     * Update analyze button state
     */
    const updateAnalyzeButtonState = () => {
        const isProcessing = AppState.get('isProcessing');
        const sowLoaded = SOWConfigManager.isLoaded();
        dom.analyzeBtn.disabled = isProcessing || !sowLoaded;

        if (!sowLoaded && !isProcessing) {
            dom.analyzeBtn.title = 'SOW not loaded - click refresh';
        } else {
            dom.analyzeBtn.title = '';
        }
    };

    /**
     * Set minimized state
     * @param {boolean} minimized
     */
    const setMinimized = (minimized) => {
        AppState.set('isMinimized', minimized);
        dom.container.classList.toggle('minimized', minimized);

        if (!minimized) {
            setTimeout(() => dom.input.focus(), 100);
        }

        Telemetry.track(TelemetryEventType.USER_ACTION, {
            action: minimized ? 'minimize' : 'expand'
        });
    };

    /**
     * Update minimized state
     */
    const updateMinimizedState = () => {
        const isHealthy = HealthCheck.isHealthy();
        dom.container.classList.remove('healthy', 'unhealthy');
        dom.container.classList.add(isHealthy ? 'healthy' : 'unhealthy');
    };

    /**
     * Start analysis
     */
    const startAnalysis = () => {
        if (!SOWConfigManager.isLoaded()) {
            showToast(Messages.ERRORS.SOW_SERVER_UNREACHABLE, 'error');
            return;
        }

        const input = dom.input.value.trim();
        const validation = Validator.parseOrderIds(input);

        dom.input.classList.remove('error');
        dom.input.removeAttribute('aria-invalid');

        if (!validation.valid || validation.sanitized.length === 0) {
            dom.input.classList.add('error');
            dom.input.setAttribute('aria-invalid', 'true');
            dom.input.focus();

            const errorMsg = validation.errors.length > 0 ? validation.errors[0] : Messages.ERRORS.INVALID_ORDER_IDS;
            showToast(errorMsg, 'error');
            return;
        }

        if (validation.errors.length > 0) {
            Logger.warn('Some order IDs were invalid', validation.errors);
            showToast(`${validation.sanitized.length} valid IDs found, ${validation.errors.length} invalid`, 'warning');
        }

        if (validation.duplicatesRemoved > 0) {
            Logger.info(`Removed ${validation.duplicatesRemoved} duplicate order IDs`);
        }

        AppState.set('isProcessing', true);
        BatchProcessor.processBatch(validation.sanitized).finally(() => {
            AppState.set('isProcessing', false);
        });
    };

    /**
     * Reset form
     */
    const resetForm = () => {
        dom.input.value = '';
        dom.input.classList.remove('error');
        dom.input.removeAttribute('aria-invalid');
        dom.results.innerHTML = '';
        AppState.resetBatch();
        dom.input.focus();

        Telemetry.track(TelemetryEventType.USER_ACTION, { action: 'reset' });
    };

    /**
     * Open settings panel - loads INSIDE the tool panel body
     */
    const openSettings = () => {
        if (AppState.get('isSettingsOpen')) return;

        AppState.set('isSettingsOpen', true);

        const currentContent = dom.results.innerHTML;
        AppState.set('_previousResultsContent', currentContent);

        dom.results.innerHTML = HTMLGenerator.settingsPanelInline();

        const inputGroup = dom.body.querySelector('.d-dart-input-group');
        if (inputGroup) {
            inputGroup.style.display = 'none';
        }

        setupSettingsEventListeners();

        Logger.info('Settings panel opened (inline)');
        Telemetry.track(TelemetryEventType.USER_ACTION, { action: 'open_settings' });
    };

    /**
     * Close settings panel - restores main view
     */
    const closeSettings = () => {
        if (!AppState.get('isSettingsOpen')) return;

        AppState.set('isSettingsOpen', false);

        const inputGroup = dom.body.querySelector('.d-dart-input-group');
        if (inputGroup) {
            inputGroup.style.display = 'flex';
        }

        const previousContent = AppState.get('_previousResultsContent') || '';
        dom.results.innerHTML = previousContent;

        Logger.info('Settings panel closed');
    };

    /**
     * Setup settings event listeners
     */
    const setupSettingsEventListeners = () => {
        const backBtn = document.getElementById('d-dart-settings-back');
        if (backBtn) {
            backBtn.addEventListener('click', closeSettings);
        }

        const closeBtn = document.getElementById('d-dart-settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeSettings);
        }

        const refreshBtn = document.getElementById('d-dart-refresh-sow');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '⏳ Refreshing...';
                await SOWConfigManager.fetch();
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Refresh SOW';
                updateSettingsPanel();
            });
        }

        const expandAllBtn = document.getElementById('d-dart-expand-all');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
                const shipperNames = SOWConfigManager.getAllShippersData().map(s => s.shipperName);
                AppState.expandAllShippers(shipperNames);
                updateShippersList();
            });
        }

        const collapseAllBtn = document.getElementById('d-dart-collapse-all');
        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
                AppState.collapseAllShippers();
                updateShippersList();
            });
        }

        const searchInput = document.getElementById('d-dart-shipper-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                AppState.set('settingsSearchTerm', e.target.value);
                debouncedSearch();
            });
        }

        const statusFilter = document.getElementById('d-dart-filter-status');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                const filters = AppState.get('settingsFilters');
                AppState.set('settingsFilters', { ...filters, status: e.target.value });
                updateShippersList();
            });
        }

        const rateFilter = document.getElementById('d-dart-filter-rate');
        if (rateFilter) {
            rateFilter.addEventListener('change', (e) => {
                const filters = AppState.get('settingsFilters');
                AppState.set('settingsFilters', { ...filters, rateType: e.target.value });
                updateShippersList();
            });
        }

        const validationFilter = document.getElementById('d-dart-filter-validation');
        if (validationFilter) {
            validationFilter.addEventListener('change', (e) => {
                const filters = AppState.get('settingsFilters');
                AppState.set('settingsFilters', { ...filters, validation: e.target.value });
                updateShippersList();
            });
        }

        const hideInactiveCheckbox = document.getElementById('d-dart-hide-inactive');
        if (hideInactiveCheckbox) {
            hideInactiveCheckbox.addEventListener('change', (e) => {
                const filters = AppState.get('settingsFilters');
                AppState.set('settingsFilters', { ...filters, hideInactive: e.target.checked });
                updateShippersList();
            });
        }

        const shippersList = document.getElementById('d-dart-shippers-list');
        if (shippersList) {
            shippersList.addEventListener('click', (e) => {
                const header = e.target.closest('[data-toggle-shipper]');
                if (header) {
                    const shipperName = header.dataset.toggleShipper;
                    AppState.toggleShipperExpanded(shipperName);
                    updateShippersList();
                }
            });
        }

        const escapeHandler = (e) => {
            if (e.key === 'Escape' && AppState.get('isSettingsOpen')) {
                closeSettings();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    };

    /**
     * Update settings panel
     */
    const updateSettingsPanel = () => {
        const stats = SOWConfigManager.getStatistics();
        const lastRefresh = SOWConfigManager.getLastRefreshTime();

        const totalEl = document.getElementById('d-dart-stats-total');
        const activeEl = document.getElementById('d-dart-stats-active');
        const inactiveEl = document.getElementById('d-dart-stats-inactive');
        const errorsEl = document.getElementById('d-dart-stats-errors');

        if (totalEl) totalEl.textContent = stats.total;
        if (activeEl) activeEl.textContent = stats.active;
        if (inactiveEl) inactiveEl.textContent = stats.inactive;
        if (errorsEl) errorsEl.textContent = stats.validationErrors;

        const lastRefreshEl = document.getElementById('d-dart-last-refresh');
        if (lastRefreshEl) {
            lastRefreshEl.textContent = `🕐 Last Refresh: ${Helpers.formatRelativeTime(lastRefresh)}`;
        }

        updateShippersList();
    };

    /**
     * Update shippers list
     */
    const updateShippersList = () => {
        const shippersList = document.getElementById('d-dart-shippers-list');
        const shippersCount = document.getElementById('d-dart-shippers-count');

        if (shippersList) {
            shippersList.innerHTML = HTMLGenerator.renderShippersList();

            const filters = AppState.get('settingsFilters');
            const searchTerm = AppState.get('settingsSearchTerm');
            const filteredShippers = SOWConfigManager.filterShippers(searchTerm, filters);

            if (shippersCount) {
                shippersCount.textContent = `📋 SHIPPERS (${filteredShippers.length})`;
            }
        }
    };

    /**
     * Copy debug log
     */
    const copyDebugLog = async () => {
        const report = Logger.generateReport();
        try {
            await Helpers.copyToClipboard(report);
            showCopyPopup();
        } catch (e) {
            showToast(Messages.ERRORS.COPY_FAILED, 'error');
        }
    };

    /**
     * Show copy popup
     */
    const showCopyPopup = () => {
        const popup = document.createElement('div');
        popup.className = 'd-dart-copy-popup';
        popup.textContent = `✅ ${Messages.SUCCESS.DEBUG_COPIED}`;
        popup.setAttribute('role', 'alert');
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), CONFIG.UI.COPY_POPUP_DURATION);
    };

    /**
     * Download CSV
     */
    const downloadCSV = () => {
        const data = AppState.get('batchReportData');
        if (!data || data.length === 0) {
            showToast(Messages.ERRORS.NO_DATA, 'error');
            return;
        }
        const csv = ReportGenerator.generateCSV(data);
        const filename = `D-DART_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        Helpers.downloadFile(csv, filename, 'text/csv');
        showToast(Messages.SUCCESS.CSV_DOWNLOADED, 'success');
    };

    /**
     * Download TXT
     */
    const downloadTXT = () => {
        const data = AppState.get('batchReportData');
        if (!data || data.length === 0) {
            showToast(Messages.ERRORS.NO_DATA, 'error');
            return;
        }
        const txt = ReportGenerator.generateTXT(data);
        const filename = `D-DART_Report_${new Date().toISOString().slice(0, 10)}.txt`;
        Helpers.downloadFile(txt, filename, 'text/plain');
        showToast(Messages.SUCCESS.TXT_DOWNLOADED, 'success');
    };

    /**
     * Check SOW error display
     */
    const checkSOWErrorDisplay = () => {
        const sowStatus = AppState.get('sowStatus');
        const sowError = AppState.get('sowLastError');

        if (sowStatus === SOWStatus.ERROR || sowStatus === SOWStatus.AUTH_REQUIRED) {
            const isAuthError = sowStatus === SOWStatus.AUTH_REQUIRED;
            dom.results.innerHTML = HTMLGenerator.sowErrorDisplay(
                sowError || Messages.ERRORS.SOW_SERVER_UNREACHABLE,
                isAuthError
            );
        }
    };

    /**
     * Show toast notification
     * @param {string} message
     * @param {string} type
     */
    const showToast = (message, type = 'info') => {
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
        dom.toast.textContent = message;
        dom.toast.className = `d-dart-toast ${type} show`;
        toastTimeout = setTimeout(() => {
            dom.toast.classList.remove('show');
        }, CONFIG.UI.TOAST_DURATION);
    };

    return {
        /**
         * Initialize UI
         */
        init() {
            injectStyles();
            createDOM();

            debouncedAnalyze = debounce(startAnalysis, CONFIG.UI.SCROLL_DEBOUNCE, true);
            debouncedSearch = debounce(updateShippersList, CONFIG.UI.SEARCH_DEBOUNCE, false);

            setupEventListeners();
            setupStateSubscriptions();

            TokenManager.init();
            this.updateTokenIndicator();
            this.updateSOWIndicator();

            if (CONFIG.START_MINIMIZED) {
                dom.container.classList.add('minimized');
                AppState.set('isMinimized', true);
            }

            Logger.info('UI initialized');
            Telemetry.track(TelemetryEventType.APP_INIT, {
                isOnSMC: Helpers.isOnSMC(),
                startMinimized: CONFIG.START_MINIMIZED
            });
        },

        /**
         * Update token indicator
         */
        updateTokenIndicator() {
            const status = TokenManager.getStatus();
            if (dom?.tokenIndicator) {
                let displayText = '🔐';
                if (status.status === 'ready' || status.status === 'warning' || status.status === 'critical') {
                    displayText = `🔐${status.remainingSeconds}s`;
                } else if (status.status === 'fetching') {
                    displayText = '🔐⏳';
                } else {
                    displayText = '🔐❌';
                }

                dom.tokenIndicator.textContent = displayText;
                dom.tokenIndicator.className = `d-dart-token-indicator ${status.class}`;
                dom.tokenIndicator.title = `Token: ${status.status}${status.remainingSeconds > 0 ? ` (${status.remainingSeconds}s)` : ''}`;
            }
            updateMinimizedState();
        },

        /**
         * Update SOW indicator
         */
        updateSOWIndicator() {
            const sowStatus = AppState.get('sowStatus');
            const shipperCount = AppState.get('sowShipperCount');

            if (dom?.sowIndicator) {
                let displayText = '📋';
                let cssClass = '';
                let title = '';

                switch (sowStatus) {
                    case SOWStatus.LOADED:
                        displayText = `📋${shipperCount}`;
                        cssClass = 'loaded';
                        title = `SOW loaded: ${shipperCount} shippers`;
                        break;
                    case SOWStatus.LOADING:
                        displayText = '📋⏳';
                        cssClass = 'loading';
                        title = 'Loading SOW...';
                        break;
                    case SOWStatus.AUTH_REQUIRED:
                        displayText = '📋🔐';
                        cssClass = 'error';
                        title = 'SharePoint login required';
                        break;
                    case SOWStatus.ERROR:
                        displayText = '📋❌';
                        cssClass = 'error';
                        title = 'SOW load failed - click refresh';
                        break;
                    default:
                        displayText = '📋...';
                        cssClass = '';
                        title = 'SOW not loaded';
                }

                dom.sowIndicator.textContent = displayText;
                dom.sowIndicator.className = `d-dart-sow-indicator ${cssClass}`;
                dom.sowIndicator.title = title;
            }

            updateMinimizedState();
            checkSOWErrorDisplay();
        },

        /**
         * Show progress steps
         * @param {Array} steps
         */
        showProgress(steps) {
            const stepsHtml = steps.map(step => `
                <div class="d-dart-step pending" id="d-dart-step-${step.id}" role="listitem">
                    <span class="d-dart-step-icon" aria-hidden="true">${step.icon}</span>
                    <span class="d-dart-step-text">${Helpers.escapeHtml(step.text)}</span>
                    <span class="d-dart-step-status" id="d-dart-step-status-${step.id}"></span>
                </div>
            `).join('');

            dom.results.innerHTML = `
                <div class="d-dart-progress">
                    <div class="d-dart-progress-title">🔄 Processing Order...</div>
                    <div class="d-dart-progress-steps" role="list">${stepsHtml}</div>
                </div>
            `;
        },

        /**
         * Update progress step
         * @param {string} stepId
         * @param {string} status
         * @param {string} statusText
         */
        updateProgressStep(stepId, status, statusText = '') {
            const stepEl = document.getElementById(`d-dart-step-${stepId}`);
            const statusEl = document.getElementById(`d-dart-step-status-${stepId}`);
            if (stepEl) {
                stepEl.className = `d-dart-step ${status}`;
            }
            if (statusEl && statusText) {
                statusEl.textContent = statusText;
            }
        },

        /**
         * Show enhanced batch progress
         * @param {number} totalOrders
         * @param {number} totalChunks
         */
        showEnhancedBatchProgress(totalOrders, totalChunks) {
            dom.results.innerHTML = HTMLGenerator.enhancedBatchProgress(totalOrders, totalChunks);
        },

        /**
         * Update enhanced batch progress
         * @param {Object} data
         */
        updateEnhancedBatchProgress(data) {
            const { processed, success, failed, total, startTime } = data;
            const remaining = total - processed;
            const percent = Math.round((processed / total) * 100);

            const setInnerText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };

            setInnerText('d-dart-stat-processed', processed);
            setInnerText('d-dart-stat-success', success);
            setInnerText('d-dart-stat-failed', failed);
            setInnerText('d-dart-stat-remaining', remaining);

            const progressBar = document.getElementById('d-dart-progress-bar');
            if (progressBar) {
                progressBar.style.width = `${percent}%`;
                progressBar.setAttribute('aria-valuenow', percent);
            }

            const currentChunk = AppState.get('currentChunk') + 1;
            const totalChunks = AppState.get('totalChunks');
            setInnerText('d-dart-chunk-info', `${currentChunk}/${totalChunks}`);

            if (processed >= 5 && startTime) {
                const elapsed = Date.now() - startTime;
                const avgTimePerOrder = elapsed / processed;
                const etaMs = remaining * avgTimePerOrder;

                const etaEl = document.getElementById('d-dart-progress-eta');
                if (etaEl) {
                    etaEl.textContent = `ETA: ${Helpers.formatETA(etaMs)}`;
                }
            }

            const tokenStatus = document.getElementById('d-dart-token-status');
            if (tokenStatus) {
                const remainingSec = TokenManager.getRemainingSeconds();
                tokenStatus.textContent = remainingSec > 0 ? `${remainingSec}s` : 'Expired';
                tokenStatus.className = remainingSec > 30 ? 'token-ok' : remainingSec > 0 ? 'token-warning' : 'token-error';
            }
        },

        /**
         * Update batch status
         * @param {string} status
         */
        updateBatchStatus(status) {
            const statusEl = document.getElementById('d-dart-progress-status');
            if (statusEl) statusEl.textContent = status;
        },

        /**
         * Show batch complete
         * @param {Array} reportData
         */
        showBatchComplete(reportData) {
            dom.results.innerHTML = HTMLGenerator.batchReportTable(reportData);
        },

        /**
         * Show processing error
         * @param {string} message
         */
        showProcessingError(message) {
            dom.results.innerHTML = `
                <div class="d-dart-error" role="alert">
                    <div class="d-dart-error-icon" aria-hidden="true">❌</div>
                    <div class="d-dart-error-title">Processing Failed</div>
                    <div class="d-dart-error-message">${Helpers.escapeHtml(message)}</div>
                </div>
            `;
        },

        /**
         * Display single order results
         * @param {OrderData} orderData
         */
        displaySingleOrderResults(orderData) {
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
        },

        /**
         * Show toast notification (public method)
         * @param {string} message
         * @param {string} type
         */
        showToast,

        /**
         * Destroy UI
         */
        destroy() {
            const moveDrag = boundHandlers.get('moveDrag');
            const endDrag = boundHandlers.get('endDrag');

            if (moveDrag) {
                document.removeEventListener('mousemove', moveDrag);
                document.removeEventListener('touchmove', moveDrag);
            }
            if (endDrag) {
                document.removeEventListener('mouseup', endDrag);
                document.removeEventListener('touchend', endDrag);
            }

            boundHandlers.clear();
            AppState.clearListeners();

            if (toastTimeout) {
                clearTimeout(toastTimeout);
                toastTimeout = null;
            }

            if (AppState.get('isSettingsOpen')) {
                closeSettings();
            }

            if (dom?.container) dom.container.remove();
            if (dom?.toast) dom.toast.remove();

            ApprovalPopup.cleanup();
            TokenManager.cleanup();
            CacheManager.cleanup();
            ProgressManager.clear();
            Telemetry.cleanup();

            Logger.info('UI destroyed and cleaned up');
        }
    };
})();

    /* ═══════════════════════════════════════════════════════════════════════════
     * SECTION 33: APPLICATION INITIALIZATION
     * ═══════════════════════════════════════════════════════════════════════════ */

 const App = {
    /**
     * Initialize application
     */
    async init() {
        Logger.info(`=== D-DART v${CONFIG.VERSION} ${CONFIG.APP_SUBTITLE} Starting ===`);
        Logger.info(`Page: ${window.location.href}`);
        Logger.info(`On SMC: ${Helpers.isOnSMC()}`);
        Logger.info(`Max Batch Size: ${CONFIG.BATCH.MAX_ORDERS_PER_SESSION}`);

        try {
            // STEP 1: Check version FIRST (before anything else)
            if (CONFIG.FEATURES.AUTO_UPDATE) {
                Logger.info('Checking for updates...');
                const versionStatus = await VersionManager.check();

                if (versionStatus !== UpdateStatus.CURRENT) {
                    // Version mismatch or error - blocking modal already shown by VersionManager
                    // DO NOT continue initialization
                    Logger.warn(`App blocked due to version status: ${versionStatus}`);
                    Telemetry.track(TelemetryEventType.APP_INIT, {
                        success: false,
                        blocked: true,
                        versionStatus: versionStatus
                    });
                    return; // STOP HERE - Don't initialize the app
                }

                Logger.info('Version check passed, continuing initialization...');
            } else {
                Logger.info('Auto-update disabled, skipping version check');
            }

            // STEP 2: Initialize UI (only if version check passed)
            UIController.init();

            // STEP 3: Load SOW configuration from SharePoint
            Logger.info('Loading SOW configuration from SharePoint...');
            await SOWConfigManager.init();

            Logger.info(`Health Check: ${HealthCheck.getSummary()}`);
            Logger.info(`=== D-DART v${CONFIG.VERSION} ${CONFIG.APP_SUBTITLE} Ready ===`);

            Telemetry.track(TelemetryEventType.APP_INIT, {
                success: true,
                sowLoaded: SOWConfigManager.isLoaded(),
                shipperCount: SOWConfigManager.getShipperCount()
            });

        } catch (error) {
            Logger.error('Initialization failed', error.message);
            console.error('D-DART initialization failed:', error);

            Telemetry.track(TelemetryEventType.APP_ERROR, {
                phase: 'init',
                error: error.message
            });
        }
    },

    /**
     * Get application info
     * @returns {Object}
     */
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
            versionStatus: VersionManager.getStatus(),
            cacheStats: CacheManager.getStats(),
            batchState: BatchProcessor.getState(),
            health: HealthCheck.check(),
            performance: PerformanceMonitor.getMetrics(),
            telemetry: Telemetry.getMetrics()
        };
    },

    /**
     * Destroy application
     */
    destroy() {
        UIController.destroy();
        SOWConfigManager.clear();
        Logger.info('Application destroyed');
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

// Expose for debugging
if (CONFIG.DEBUG_ENABLED) {
    window.DDART = {
        App,
        AppState,
        Logger,
        TokenManager,
        SOWConfigManager,
        CacheManager,
        ProgressManager,
        BatchProcessor,
        HealthCheck,
        PerformanceMonitor,
        Telemetry,
        DetentionAnalyzer,
        VersionManager,
        CONFIG,
        version: CONFIG.VERSION,
        edition: CONFIG.APP_SUBTITLE,
        test: {
            analyzeOrder: (orderId) => BatchProcessor.processBatch([orderId]),
            analyzeBatch: (orderIds) => BatchProcessor.processBatch(orderIds),
            getState: () => AppState.getSnapshot(),
            getHealth: () => HealthCheck.check(),
            isHealthy: () => HealthCheck.isHealthy(),
            clearCache: () => CacheManager.clear(),
            clearProgress: () => ProgressManager.clear(),
            refreshToken: () => TokenManager.ensure(),
            refreshSOW: () => SOWConfigManager.fetch(),
            getSOWConfig: (shipper) => SOWConfigManager.getConfig(shipper),
            getAllShippers: () => SOWConfigManager.getShipperNames(),
            getAllShippersData: () => SOWConfigManager.getAllShippersData(),
            getSOWStats: () => SOWConfigManager.getStatistics(),
            openSettings: () => Logger.warn('Use settings button in UI'),
            closeSettings: () => Logger.warn('Use back button in settings'),
            showToast: (msg, type) => UIController.showToast(msg, type),
            generateReport: () => Logger.generateReport(),
            pauseBatch: () => BatchProcessor.pause(),
            resumeBatch: () => BatchProcessor.resume(),
            cancelBatch: () => BatchProcessor.cancel(),
            getInfo: () => App.getInfo(),
            previewCharge: (params) => DetentionAnalyzer.previewCharge(params),
            getPerformance: () => PerformanceMonitor.getMetrics(),
            getTelemetry: () => Telemetry.getMetrics(),
            // Version management test functions
            getVersionStatus: () => VersionManager.getStatus(),
            clearVersionCache: () => VersionManager.clearCache(),
            forceVersionCheck: async () => {
                VersionManager.clearCache();
                return await VersionManager.check();
            },
            resetCircuitBreakers: () => {
                Object.values(circuitBreakers).forEach(cb => cb.reset());
                Logger.info('All circuit breakers reset');
            }
        }
    };
}

})();