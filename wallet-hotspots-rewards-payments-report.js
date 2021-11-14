/*
 * Ryan Patridge
 * ryanp@splatspace.org
 * http://cryptotickle.me/
 * https://github.com/Pseudothink/helium-scripts
 * Version: 2021-11-13
 *
 * This script exports all Helium reward transactions over a specified period of time to per-hotspot CSV files, for all
 * hotspots owned by a specified Helium wallet.  It also saves files useful for reporting and making payments to hosts.
 * 
 * Use the script configuration section below to specify the wallet address, report start and end dates, payment  memo, 
 * and minimum payment amount.  Use the hotspotsHostsData JSON object in the script configuration section to provide 
 * hotspot host information used for generating payments.
 * 
 * Additional script outputs:
 *   A host payments JSON file: Payments_REPORT_START_DATE-REPORT_END_DATE-SCRIPT_RUN_DATE.json
 *      This is intended for use as input to helium-wallet-rs, to send payment transactions from a CLI wallet.  
 *      For more info, see https://github.com/helium/helium-wallet-rs
 * 
 *   A merged host payments JSON file: PaymentsMerged_REPORT_START_DATE-REPORT_END_DATE-SCRIPT_RUN_DATE.json
 *      This file is generated only if one or more wallets receives multiple payments.  This is intended as a 
 *      replacement for the host payments JSON file (above), and merges all payments made to each wallet into a single 
 *      payment.  
 * 
 *   A deferred payments JSON file: DeferredPayments_REPORT_START_DATE-REPORT_END_DATE-SCRIPT_RUN_DATE.json
 *      All payments under the PAYMENT_MINIMUM_AMOUNT or without a valid wallet address are exported to this file.
 * 
 *   A merged host payments JSON file: DeferredPaymentsMerged_REPORT_START_DATE-REPORT_END_DATE-SCRIPT_RUN_DATE.json
 *      This file is generated only if one or more wallets receives multiple deferred payments.  This is intended as a 
 *      replacement for the deferred payments JSON file (above), and merges all deferred payments made to each wallet 
 *      into a single payment.  
 * 
 *   A host earnings report CSV file: Earnings_REPORT_START_DATE-REPORT_END_DATE-SCRIPT_RUN_DATE.csv
 *      This file contains host earnings for every hotspot, including records omitted from payments JSON output because
 *      of missing hotspotHostData information.
 * 
 *   A hotspotsHostsData JSON file: HotspotsHostsData_REPORT_START_DATE-REPORT_END_DATE-SCRIPT_RUN_DATE.json
 *      A copy of hotspotHostData, updated with information from all hotspots found for the specified owner.
 * 
 * TODO: Parameterize script configuration.
 * TODO: Add support for splitting a hotspot's earnings between multiple hosts within the same time period.
 * TODO: Suppress multiple warnings of "Unable to assign reward" or save them to a new default hotspotsHostsData entry.
 * 
 */

const { DateTime, Duration } = require("luxon"); // For Datetime manipulation: https://moment.github.io/luxon/api-docs/index.html
const SCRIPT_START_TIME = DateTime.now();
const httplib = require("@helium/http"); // Helium Javascript HTTP API: https://github.com/helium/helium-js/

// https://github.com/helium/helium-js/blob/master/packages/http/src/Network.ts
// Stakejoy is a good alternative API endpoint to production, if production is overloaded.
//const client = new httplib.Client(httplib.Network.production); // Helium production API endpoint, https://api.helium.io
const stakejoy = new httplib.Network({
    baseURL: 'https://helium-api.stakejoy.com',
    version: 1,
});
const client = new httplib.Client(stakejoy); // Stakejoy production API endpoint, https://helium-api.stakejoy.com

const fs = require("fs");  // Node file system API: https://nodejs.org/api/fs.html

// ==========================================================================
//    Script configuration
// ==========================================================================

const WALLET_ADDRESS = "13shErS29gws7ikVxkb4s13PZ6sQLSY63xRKP8DEBww2qWFhUu5"; // Use this to specify the owner's wallet.

// Note: I recommend using UTC time zone with start & end dates, as Helium transaction times are stored in UTC.  But as long as you consistently use the same time zone it shouldn't matter.
// Dates must be specified using an ISO 8601 string. (See: https://en.wikipedia.org/wiki/ISO_8601)
const REPORT_START_DATE_STRING = "2021-10-01T00:00:00.000Z"; // Set to the datetime at which to start reporting host earnings and payments (including this exact datetime).
const REPORT_END_DATE_STRING = "2021-11-01T00:00:00.000Z"; // Set to the datetime at which to stop reporting host earnings and payments (excluding this exact datetime).
const PAYMENT_MEMO = "20211101"; // Set to the string to use in payment transactions, up to 8 bytes.
const PAYMENT_MINIMUM_AMOUNT = 0.4;  // Minimum amount of HNT necessary to create a payment transaction.

const MAX_HOTSPOTS = 30;  // Set to the maximum number of hotspots for which to return reward transaction information.
const MAX_TRANSACTIONS_PAGES = 300;  // Set to the maximum total number of search pages (of transactions) to return for a particular hotspot.
const TRANSACTIONS_PAGE_SIZE = 50;  // Set to the number of transactions to return per search page, for a particular hotspot.
const LOWEST_BLOCK_INDEX = 468000;  // Set to the lowest block from which to return search results.  Lowest possible value is 1 (the genesis block).

const DISPLAY_INFO_LEVEL = 1;  // Set amount of status information to display: 0 = low, 1 = medium, 2 = verbose
const DISPLAY_CONSOLE_COLORS = true;  // Set false for unformatted console output.

/*
 * hotspotsHostsData is an array storing the hotspot host information used to generate an earnings report and payment JSON files from 
 *      hotspot reward transactions.  Hotspots returned in the search which don't match an entry in the array will have a default entry 
 *      created for them, and returned in the HotspotsHostsData output file.  A hotspot may have multiple entries in the array, 
 *      corresponding to different hosts/custodians for different periods of time.  Some example entries are included below.
 * 
 *   For each object in the array:
 *      "name" is the Helium hotspot display name (based on https://github.com/helium/angry-purple-tiger).
 * 
 *      "address" is the 51-character Helium hotspot address.
 * 
 *      "grossShare" is a value between 0 and 1, the percentage of the gross earnings from which to portion the host's netShare.
 *          This allows a per-hotspot percentage to be escrowed for income tax payment purposes.
 *           For more info: https://www.irs.com/articles/2020-federal-tax-rates-brackets-standard-deductions/
 * 
 *      "netShare" is a value between 0 and 1, the host's percentage share of the net earnings, after the gross earnings have been reduced by grossShare percent.
 * 
 *      "hostName" is a descriptive name for the hotspot host/custodian.
 * 
 *      "hostWallet" is the host's 51-character Helium wallet address, or a placeholder temporary string if it isn't known.
 * 
 *      "fromDatetimeISO" is an ISO 8601 string defining the beginning of the period of time this host served as custodian for this hotspot.
 *          If not known, it is acceptable to use a date in the past, after 1970, or to omit the property definition altogether.
 * 
 *      "toDatetimeISO" is ISO 8601 string defining the end of the period of time this host served as custodian for this hotspot.
 *          If not known, it is acceptable to use a date in the future, or to omit the property definition altogether.
 * 
 *       Reserved property names (do not define the following property names, or the script may not function as intended):
 *          fromDatetime, toDatetime, grossEarnings, netEarnings, hostEarnings, hostWalletValidated
 */
let hotspotsHostsData = [{
    "name": "cheesy-bamboo-gorilla",
    "address": "112SZBhwV8Dp3QFgYYWN7hvz2xs5VjcimpVfzEZ1SWEnZFBEdnih",
    "grossShare": "0.78",
    "netShare": "0.25",
    "hostName": "Alice from Liuzhou Shi",
    "hostWallet": "Alice's Wallet Address",
    "fromDatetimeISO": "2019-01-01T00:00:00.000Z",
    "toDatetimeISO": "2099-01-01T00:00:00.000Z"
},
{
    "name": "cheerful-fern-shrimp",
    "address": "11TpYdBXWfg88Nm28XBDJeomKTkVjURfUMcaHu6ZDF5sfm8u6Kk",
    "grossShare": "0.78",
    "netShare": "0.25",
    "hostName": "Bob from Liuzhou Shi",
    "hostWallet": "Bob's Wallet Address",
    "fromDatetimeISO": "2019-01-01T00:00:00.000Z",
    "toDatetimeISO": "2020-01-01T00:00:00.000Z"
},
{
    "name": "cheerful-fern-shrimp",
    "address": "11TpYdBXWfg88Nm28XBDJeomKTkVjURfUMcaHu6ZDF5sfm8u6Kk",
    "grossShare": "0.78",
    "netShare": "0.25",
    "hostName": "Barbara from Liuzhou Shi",
    "hostWallet": "Barbara's Wallet Address",
    "fromDatetimeISO": "2020-01-01T00:00:00.000Z",
    "toDatetimeISO": "2099-01-01T00:00:00.000Z"
},
{
    "name": "nutty-ultraviolet-blackbird",
    "address": "112LkSVMykLfGkEdSoKm1AbLkeTiNo4TdBcwjoBkyzXbACBSjQVv",
    "grossShare": "0.78",
    "netShare": "0.25",
    "hostName": "Claire from Liuzhou Shi",
    "hostWallet": "Claire's Wallet Address",
    "fromDatetimeISO": "2019-01-01T00:00:00.000Z",
    "toDatetimeISO": "2099-01-01T00:00:00.000Z"
}];

// ==========================================================================
//    End script configuration
// ==========================================================================


// Define terminal text styles.  From: https://simplernerd.com/js-console-colors/
const TerminalStyles = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    // Foreground (text) colors
    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m"
    },
    // Background colors
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        crimson: "\x1b[48m"
    }
};
const consoleLog = (text) => {
    console.log(text);
};
const consoleLogColor = (color, text) => {
    if (DISPLAY_CONSOLE_COLORS) {
        console.log(`${color}%s${TerminalStyles.reset}`, text);
    } else {
        console.log(text);
    }
};
const consoleLogLabeledValue = (label, value, color) => {
    if (DISPLAY_CONSOLE_COLORS) {
        console.log(`%s${color}%s${TerminalStyles.reset}`, label, value);
    } else {
        console.log(label + value);
    }
};

const INFO_LOW = 0;
const INFO_MEDIUM = 1;
const INFO_VERBOSE = 2;

const consoleInfo = (infoLevel, text) => {
    if (infoLevel <= DISPLAY_INFO_LEVEL) {
        if (DISPLAY_CONSOLE_COLORS) {
            console.log(`${TerminalStyles.dim}${TerminalStyles.fg.white}INFO: %s${TerminalStyles.reset}`, text);
        } else {
            console.log("INFO: " + text);
        }
    }
};
const consoleWarn = (text) => {
    if (DISPLAY_CONSOLE_COLORS) {
        console.warn(`${TerminalStyles.fg.yellow}WARNING: %s${TerminalStyles.reset}`, text);
    } else {
        console.warn("WARNING: " + text);
    }
};
const consoleError = (text) => {
    if (DISPLAY_CONSOLE_COLORS) {
        console.error(`${TerminalStyles.fg.red}ERROR: %s${TerminalStyles.reset}`, text);
    } else {
        console.error("ERROR: " + text);
    }
};
// https://stackoverflow.com/questions/20169217/how-to-write-isnumber-in-javascript
var isNumber = function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
}
var isNumberObject = function isNumberObject(n) {
    return (Object.prototype.toString.apply(n) === '[object Number]');
}
var isCustomNumber = function isCustomNumber(n) {
    return isNumber(n) || isNumberObject(n);
}

// PAST_DATE and FUTURE_DATE are used as default values when needed.
const PAST_DATE = DateTime.fromSeconds(0); // 1970-01-01T00:00:00.000Z
const HELIUM_FOREVER_100_YEARS = Duration.fromISO("P100Y"); // https://www.youtube.com/watch?v=aQ4Sb_rnCqw
const FUTURE_DATE = SCRIPT_START_TIME.plus(HELIUM_FOREVER_100_YEARS); // Helium and IoT 100 years forever...every day all the time 100 years forever dot com!

// HNT is limited to 8 decimal places.  See: 
// https://github.com/helium/helium-js/blob/master/packages/currency/src/currency_types/NetworkTokens.ts
// https://github.com/helium/helium-js/blob/master/packages/currency/src/currency_types/BaseCurrencyType.ts
const HNT_DECMIAL_PLACES = 8;

// Create datetime values from provided string values.
const REPORT_START_DATE = DateTime.fromISO(REPORT_START_DATE_STRING);
const REPORT_END_DATE = DateTime.fromISO(REPORT_END_DATE_STRING);

// In helium-wallet-rs, memo is a u64 (64-bit integer type).
// https://github.com/helium/helium-wallet-rs/blob/master/src/memo.rs
// https://doc.rust-lang.org/std/primitive.u64.html
const PAYMENT_MEMO_BASE64 = Buffer.from(PAYMENT_MEMO.substring(0, 8), "utf8").toString("base64"); // PAYMENT_MEMO, Base64 encoded, truncated to 8 bytes or fewer.

// Notify if PAYMENT_MEMO is over 8 bytes.
if (PAYMENT_MEMO.length > 8) {
    consoleWarn("Payment memo (" + PAYMENT_MEMO + ") is longer than 8 bytes.  Memo has been truncated to: " + Buffer.from(PAYMENT_MEMO_BASE64, "base64").toString("utf8"));
}

// Datetime validation.
if (!REPORT_START_DATE.isValid) {
    consoleError("Specified report start date (" + REPORT_START_DATE_STRING + ") is not a valid ISO 8601 string. (https://en.wikipedia.org/wiki/ISO_8601).");
    process.exit(1);
}
if (!REPORT_END_DATE.isValid) {
    consoleError("Specified report end date (" + REPORT_END_DATE_STRING + ") is not a valid ISO 8601 string. (https://en.wikipedia.org/wiki/ISO_8601).");
    process.exit(1);
}

// Warn if REPORT_START_DATE > REPORT_END_DATE
if (REPORT_START_DATE > REPORT_END_DATE) {
    consoleError("Specified report start date (" + REPORT_START_DATE.toUTC().toISO() + ") is later than report end date (" + REPORT_END_DATE.toUTC().toISO() + ").  These values must specify a valid period of time.");
    process.exit(1);
}

// Display script configuration settings.
consoleLogLabeledValue("Hotspots owned by: ", WALLET_ADDRESS, TerminalStyles.fg.green);
consoleLogLabeledValue("Report from: ", REPORT_START_DATE_STRING + " (" + REPORT_START_DATE.toUTC().toISO() + ")", TerminalStyles.fg.green);
consoleLogLabeledValue("Report to: ", REPORT_END_DATE_STRING + " (" + REPORT_END_DATE.toUTC().toISO() + ")", TerminalStyles.fg.green);
consoleLogLabeledValue("Payment memo: ", Buffer.from(PAYMENT_MEMO_BASE64, "base64").toString("utf8") + " (" + PAYMENT_MEMO_BASE64 + ")", TerminalStyles.fg.green);
consoleLogLabeledValue("Payment minumum: ", PAYMENT_MINIMUM_AMOUNT + " HNT", TerminalStyles.fg.green);
consoleLogLabeledValue("Hotspot hosts defined: ", hotspotsHostsData.length, TerminalStyles.fg.green);
consoleLogLabeledValue("Earliest block: ", LOWEST_BLOCK_INDEX, TerminalStyles.fg.green);
consoleLogLabeledValue("Max hotspots: ", MAX_HOTSPOTS, TerminalStyles.fg.green);
consoleLogLabeledValue("Max transactions: ", (MAX_TRANSACTIONS_PAGES * TRANSACTIONS_PAGE_SIZE), TerminalStyles.fg.green);
consoleLogLabeledValue("API endpoint: ", client.network.endpoint, TerminalStyles.fg.green);
consoleLogLabeledValue("Script start time: ", SCRIPT_START_TIME.toISO(), TerminalStyles.fg.green);

/*
 * Initialize hotspotsHostsData with default values, where needed.
 */
for (i = 0; i < hotspotsHostsData.length; i += 1) {
    // Add fromDatetime to the hotspotsHostsData entry.  Default to PAST_DATE if not specified in fromDatetimeISO.
    if (hotspotsHostsData[i].fromDatetime === undefined) {
        if (hotspotsHostsData[i].fromDatetimeISO !== undefined) {
            hotspotsHostsData[i].fromDatetime = DateTime.fromISO(hotspotsHostsData[i].fromDatetimeISO);
        } else {
            hotspotsHostsData[i].fromDatetime = PAST_DATE;
        }
    }

    // Add toDatetime to the hotspotsHostsData entry.  Default to FUTURE_DATE if not specified in toDatetimeISO.
    if (hotspotsHostsData[i].toDatetime === undefined) {
        if (hotspotsHostsData[i].toDatetimeISO !== undefined) {
            hotspotsHostsData[i].toDatetime = DateTime.fromISO(hotspotsHostsData[i].toDatetimeISO);
        } else {
            hotspotsHostsData[i].toDatetime = FUTURE_DATE;
        }
    }

    // Initialize grossEarnings accumulator value to 0.0.
    hotspotsHostsData[i].grossEarnings = 0.0;

    // Display hotspotsHostsData summary.
    //consoleInfo(INFO_VERBOSE, "Hotspot: " + hotspotsHostsData[i].name);
    //consoleInfo(INFO_VERBOSE, "Host Name: " + hotspotsHostsData[i].hostname);
    //consoleInfo(INFO_VERBOSE, "From: " + hotspotsHostsData[i].fromDatetime.toUTC().toISO());
    //consoleInfo(INFO_VERBOSE, "To: " + hotspotsHostsData[i].toDatetime.toUTC().toISO());
    //consoleInfo(INFO_VERBOSE, "Gross Share: " + hotspotsHostsData[i].grossShare);
    //consoleInfo(INFO_VERBOSE, "Net Share: " + hotspotsHostsData[i].netShare);
}

function appendStringToFile(stringValue, stringDescription, fileName) {
    let fileStream;
    try {
        consoleLogLabeledValue("Exporting " + stringDescription + " to: ", fileName, TerminalStyles.fg.green);
        fileStream = fs.openSync(fileName, "a"); // Create a stream for appending, to avoid overwriting an existing file.
        fs.appendFileSync(fileStream, stringValue);
    } catch (e) {
        consoleError("Exporting " + stringDescription + " to: " + fileName);
        consoleLog(e.stack);
    } finally {
        if (fileStream) fs.closeSync(fileStream);
    }
}

/*
 * Merge payments made to the same wallet into a single payment.
 * TODO: optimize this to better handle large arrays.
 */
function mergePayments(paymentsArray) {
    let mergedPaymentsArray = [];

    for (i = 0; i < paymentsArray.length; i += 1) {
        let mergedPayments = mergedPaymentsArray.find(mp => mp.address === paymentsArray[i].address); // Find whether payments to this wallet address have already been merged.
        if (mergedPayments === undefined) {
            // Payments to this wallet address have not yet been merged.
            let sameWalletPayments = paymentsArray.filter(p => p.address === paymentsArray[i].address); // Find all payments with the same wallet address.
            if (sameWalletPayments.length > 1) {
                // Found multiple payments made to this wallet address.
                let mergedAmount = 0.0;
                consoleInfo(INFO_MEDIUM, "Merging payments to wallet: " + sameWalletPayments[0].address);

                // Sum the payments...
                for (j = 0; j < sameWalletPayments.length; j += 1) {
                    consoleInfo(INFO_MEDIUM, "Adding payment: " + sameWalletPayments[j].amount);
                    mergedAmount += Number.parseFloat(sameWalletPayments[j].amount);
                }

                // Create a new merged payment based on this one.
                let mergedPayment = {};
                mergedPayment.address = paymentsArray[i].address;
                mergedPayment.amount = mergedAmount.toFixed(HNT_DECMIAL_PLACES);
                mergedPayment.memo = paymentsArray[i].memo;

                consoleInfo(INFO_MEDIUM, "Merged payments sum: " + mergedPayment.amount);
                mergedPaymentsArray.push(mergedPayment);
            } else {
                // Only found a single payment made to this wallet address.
                mergedPaymentsArray.push(sameWalletPayments[0]);
            }
        } else {
            // Payments to this wallet address have already been merged.
            if (mergedPayments.length > 1) {
                consoleWarn("Found multiple merged payments to the same account address (" + mergedPayments[0].address + ").  This shouldn't happen.  Check the script and output for errors.")
            }
        }
    }

    return mergedPaymentsArray;
}

(async function main() {
    try {
        // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Accounts.ts
        //const account = await client.accounts.fromAddress(WALLET_ADDRESS); // Get the account for this address.
        const account = await client.accounts.get(WALLET_ADDRESS); // Get the account for this address.

        if (account) {
            // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Hotspots.ts
            // https://github.com/helium/helium-js/blob/master/packages/http/src/models/Hotspot.ts
            // https://github.com/helium/helium-js/blob/master/packages/http/src/ResourceList.ts
            const hotspots = await account.hotspots.list(); // List hotspots for the specified account.  Returns all at once (not paginated).
            //consoleInfo(INFO_VERBOSE, JSON.stringify(hotspots));

            let iHotspots = 0;
            let earningsCSV = ""; // For CSV export file.
            let paymentsJSON = []; // Array for JSON export file.
            let deferredPaymentsJSON = []; // Array for JSON export file.

            for (const hotspot of hotspots.data) {
                consoleInfo(INFO_LOW, "Requesting reward transactions for hotspot: " + hotspot.name + " (" + hotspot.address + ")");
                consoleInfo(INFO_LOW, "(This may take a while...)");

                // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Transactions.ts
                // https://github.com/helium/helium-js/blob/master/packages/http/src/models/Transaction.ts
                // https://github.com/helium/helium-js/blob/master/packages/http/src/ResourceList.ts
                const transactions = await hotspot.activity.list({
                    filterTypes: ["rewards_v1", "rewards_v2"]
                });
                //consoleInfo(INFO_LOW, JSON.stringify(transactions));

                let iTransactions = 0;
                let iTransactionPages = 0;
                let iTransactionsPageLength = 0;
                let bLimitReached = false;
                let hotspotRewardsCSV = "";  // Collect the CSV export rows for any rewards associated with this hotspot.

                try {
                    do {
                        const transactionsPage = await transactions.take(TRANSACTIONS_PAGE_SIZE);
                        iTransactionsPageLength = transactionsPage.length;

                        //consoleInfo(INFO_LOW, JSON.stringify(transactionsPage));
                        consoleInfo(INFO_LOW, "Processing reward transactions (Page " + (iTransactionPages + 1) + "): " + iTransactionsPageLength)

                        for (const transaction of transactionsPage) {
                            let transactionTime = DateTime.fromSeconds(transaction.time, { zone: "UTC" });  // Transaction time is in seconds, not milliseconds, UTC timezone.
                            consoleInfo(INFO_VERBOSE, "Reward transaction time: " + transactionTime.toUTC().toISO());

                            // Stop processing transactions happening prior to REPORT_START_DATE.
                            if (transactionTime < REPORT_START_DATE) {
                                consoleInfo(INFO_MEDIUM, "Reached configurable search limit (REPORT_START_DATE_STRING): " + REPORT_START_DATE_STRING);
                                bLimitReached = true;
                                break;
                            }

                            // Stop processing transactions for blocks prior to LOWEST_BLOCK_INDEX.
                            if (transaction.height < LOWEST_BLOCK_INDEX) {
                                consoleInfo(INFO_MEDIUM, "Reached configurable search limit (LOWEST_BLOCK_INDEX): " + LOWEST_BLOCK_INDEX);
                                bLimitReached = true;
                                break;
                            }

                            // Determine whether this reward transaction is within the specified report period.
                            let bIncludeRewardTransaction = false;
                            if ((transactionTime >= REPORT_START_DATE) && (transactionTime < REPORT_END_DATE)) {
                                bIncludeRewardTransaction = true;
                            }

                            // Create an output record for each reward in this transaction.
                            // If transaction datetime is within the specified report period, add the reward to a matching hotspotsHostsData entry,
                            // or to a new entry if no matching entry is found.
                            for (const reward of transaction.rewards) {
                                let rewardAmountBigBalance;
                                let rewardAmountTypeTicker;
                                let bRewardAssigned = false;
                                let bMatchedHotspotHostEntry = false;

                                if (reward.amount) {
                                    rewardAmountBigBalance = reward.amount.bigBalance;
                                    if (bIncludeRewardTransaction) {
                                        // NOTE: Iterating through the entire array assumes hotspotsHostsData.length isn't be large enough to merit an optimized (ie. sorted and efficiently searchable) data structure.
                                        for (i = 0; i < hotspotsHostsData.length; i += 1) {
                                            if (hotspotsHostsData[i].address === hotspot.address) {
                                                bMatchedHotspotHostEntry = true;
                                                consoleInfo(INFO_VERBOSE, "Checking hotspot host entry: " + hotspot.name + ", " + hotspotsHostsData[i].hostName);

                                                // If transactionTime falls between the hotspotsHostsData fromDatetime and toDatetime, add it to grossEarnings.
                                                if ((transactionTime >= hotspotsHostsData[i].fromDatetime) && (transactionTime < hotspotsHostsData[i].toDatetime)) {
                                                    // If the reward occurred during the period associated with this hotspotsHostsData entry.
                                                    consoleInfo(INFO_VERBOSE, "Matched reward to hotspot host entry: " + hotspot.name + ", " + hotspotsHostsData[i].hostName + ", " + hotspotsHostsData[i].fromDatetime.toUTC().toISO() + ", " + hotspotsHostsData[i].toDatetime.toUTC().toISO());

                                                    if (bRewardAssigned) {
                                                        consoleWarn("Multiple hotspotsHostsData entries matched the same reward transaction datetime (" + transactionTime.toUTC().toISO() + ").  Reward assigned only to the first match.");
                                                    } else {
                                                        if (isNumber(hotspotsHostsData[i].grossEarnings)) {
                                                            hotspotsHostsData[i].grossEarnings += Number.parseFloat(rewardAmountBigBalance);
                                                            consoleInfo(INFO_VERBOSE, "Added reward: " + Number.parseFloat(rewardAmountBigBalance) + ", Gross Earnings: " + hotspotsHostsData[i].grossEarnings);
                                                            bRewardAssigned = true;
                                                        } else {
                                                            consoleWarn("HotspotHostEntry.grossEarnings is malformed: " + hotspotsHostsData[i].grossEarnings + ". Host entry skipped.");
                                                        }

                                                    }
                                                }
                                            }
                                        } // end for each hotspotsHostsData

                                        // If didn't find a matching hotspotsHostsData entry, add a new one for this hotspot.
                                        if (!bMatchedHotspotHostEntry) {
                                            consoleInfo(INFO_MEDIUM, "Adding new hotspot host data entry for: " + hotspot.name);
                                            let newHotspotHostEntry = {
                                                "name": hotspot.name,
                                                "address": hotspot.address,
                                                "grossShare": 0.0,
                                                "netShare": 0.0,
                                                "grossEarnings": Number.parseFloat(rewardAmountBigBalance),
                                                "hostName": "unknown",
                                                "hostWallet": "unknown",
                                                "fromDatetimeISO": PAST_DATE.toUTC().toISO(),
                                                "fromDatetime": PAST_DATE,
                                                "toDatetimeISO": FUTURE_DATE.toUTC().toISO(),
                                                "toDatetime": FUTURE_DATE
                                            };

                                            hotspotsHostsData.push(newHotspotHostEntry);
                                            bRewardAssigned = true;
                                        } else {
                                            if (!bRewardAssigned) {
                                                // TODO: This gets triggered repeatedly if a hotspot host entry exists for a specific timespan, but earnings 
                                                // transactions are found outside that timespan.  Clean this up by creating a new, default host entry for 
                                                // timespans before (or after) the existing one timespan, and issue a single warning instead.  Or just 
                                                // repeated multiple warnings, instead.
                                                consoleWarn("Unable to assign reward to a hotspot host entry: " + rewardAmountBigBalance + " (" + transactionTime.toUTC().toISO() + ")");
                                            }
                                        }
                                    }

                                    if (reward.amount.type) {
                                        rewardAmountTypeTicker = reward.amount.type.ticker;
                                    } else {
                                        consoleWarn("Warning: Undefined reward amount type: " + JSON.stringify(reward));
                                    }
                                } else {
                                    consoleWarn("Warning: Undefined reward amount: " + JSON.stringify(reward));
                                }

                                // Add this reward transaction record to hotspotRewardsCSV.
                                hotspotRewardsCSV = hotspotRewardsCSV + transactionTime.toUTC().toISO() + "," +
                                    rewardAmountBigBalance + "," +
                                    rewardAmountTypeTicker + "," +
                                    reward.type + "," +
                                    transaction.height + "," +
                                    transaction.hash + "\n";
                            } // for each reward

                            iTransactions += 1;
                        } // for each transaction

                        iTransactionPages += 1;
                        if (iTransactionPages >= MAX_TRANSACTIONS_PAGES) {
                            consoleInfo(INFO_MEDIUM, "Reached configurable query limit (MAX_TRANSACTIONS_PAGES): " + MAX_TRANSACTIONS_PAGES);
                            break;
                        }
                    } while (!bLimitReached && transactions.hasMore && iTransactionsPageLength === TRANSACTIONS_PAGE_SIZE)  // If iTransactionsPageLength !== TRANSACTIONS_PAGE_SIZE, there are no more transactions to return.

                    if (iTransactions > 0) consoleLogLabeledValue("Rewards processed: ", iTransactions, TerminalStyles.fg.green);

                    //consoleInfo(INFO_VERBOSE, "hotspotRewardsCSV:");
                    //consoleInfo(INFO_VERBOSE, hotspotRewardsCSV);

                    /*
                     * Export hotspot reward transactions CSV file.
                     */
                    const HOTSPOT_REWARDS_CSV_COLUMNS = "Date,Received Quantity,Received Currency,Reward Type,Block,Hash\n";
                    const HOTSPOT_REWARDS_FILE_NAME = "Rewards_" + hotspot.name + "_" + hotspot.address + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".csv";
                    appendStringToFile(HOTSPOT_REWARDS_CSV_COLUMNS + hotspotRewardsCSV, "hotspot reward transactions", HOTSPOT_REWARDS_FILE_NAME);

                    /*
                     * Create host payment transaction record(s) for this hotspot, if one or more corresponding hotspotsHostsData entries are found with nonzero grossEarnings.
                     */
                    for (i = 0; i < hotspotsHostsData.length; i += 1) {
                        if (hotspotsHostsData[i].address === hotspot.address) {
                            // Confirm the hotspot host entry name matches the hotspot name, just as a check for copy/paste errors or typos.
                            if (hotspot.name !== hotspotsHostsData[i].name) {
                                consoleWarn("hotspotHostEntry.name " + hotspotsHostsData[i].name + " does not exactly match the hotspot name (" + hotspot.name + ").");
                            }
                            consoleInfo(INFO_VERBOSE, "hotspotsHostsData[" + i + "].name: " + hotspotsHostsData[i].name);
                            consoleInfo(INFO_VERBOSE, "hotspotsHostsData[" + i + "].hostName: " + hotspotsHostsData[i].hostName);
                            consoleInfo(INFO_VERBOSE, "hotspotsHostsData[" + i + "].hostWallet: " + hotspotsHostsData[i].hostWallet);
                            consoleInfo(INFO_VERBOSE, "hotspotsHostsData[" + i + "].grossEarnings: " + hotspotsHostsData[i].grossEarnings);

                            let fGrossShare = 0.0;
                            let fNetShare = 0.0;
                            let fNetEarnings = 0.0;
                            let fHostEarnings = 0.0;
                            let bValidWalletAddress = false;

                            // Simple validation to check that host wallet address is 51 characters long.
                            // TODO: Also check that it's actually a valid wallet, and not a hotspot or validator?
                            if (hotspotsHostsData[i].hostWallet !== undefined) {
                                if (hotspotsHostsData[i].hostWallet.length === 51) {
                                    bValidWalletAddress = true;
                                } else {
                                    consoleWarn("Invalid host wallet address (" + hotspotsHostsData[i].hostWallet + ") found for " + hotspot.name + " (hosted by " + hotspotsHostsData[i].hostName + ").  It must be 51 characters long.  Any payments will be saved to the DeferredPayments JSON output file.");
                                }
                            } else {
                                consoleWarn("No host wallet address found for " + hotspot.name + " (hosted by " + hotspotsHostsData[i].hostname + ").  Any payments will be saved to the DeferredPayments JSON output file.");
                            }
                            hotspotsHostsData[i].hostWalletValidated = bValidWalletAddress;

                            if (hotspotsHostsData[i].grossEarnings !== undefined) {
                                fGrossShare = Number.parseFloat(hotspotsHostsData[i].grossShare);
                                fNetShare = Number.parseFloat(hotspotsHostsData[i].netShare);
                                fNetEarnings = (hotspotsHostsData[i].grossEarnings * fGrossShare);
                                fHostEarnings = fNetEarnings * fNetShare;  // Note: this multiplication will probably create a mantissa longer than the 8 digits supported by Helium.

                                // Save the netEarnings and hostEarnings values for later export of hotspotsHostsData.
                                hotspotsHostsData[i].netEarnings = fNetEarnings.toFixed(HNT_DECMIAL_PLACES);
                                hotspotsHostsData[i].hostEarnings = fHostEarnings.toFixed(HNT_DECMIAL_PLACES);

                                // Don't create a payment transaction if host earnings are zero.
                                if (fHostEarnings > 0) {
                                    let paymentRecord = {};

                                    if ((fHostEarnings >= PAYMENT_MINIMUM_AMOUNT) && bValidWalletAddress) {
                                        // Only add payments over the minimum amount, to hosts with a valid wallet address.
                                        // JSON format for transaction file with multiple payments is defined here:
                                        // https://github.com/helium/helium-wallet-rs
                                        paymentRecord.address = hotspotsHostsData[i].hostWallet; // The host's wallet address.
                                        paymentRecord.amount = fHostEarnings.toFixed(HNT_DECMIAL_PLACES); // Truncate the mantissa to the 8 digits supported by Helium.
                                        paymentRecord.memo = PAYMENT_MEMO_BASE64;

                                        paymentsJSON.push(paymentRecord);
                                        consoleInfo(INFO_VERBOSE, "Added payment:");
                                    } else {
                                        // Add deferred payments under the minimum amount, or for hosts without a valid wallet address
                                        // specified in hotspotsHostsData.

                                        if (fHostEarnings < PAYMENT_MINIMUM_AMOUNT) {
                                            consoleWarn("Host earnings (" + fHostEarnings.toFixed(HNT_DECMIAL_PLACES) + " HNT) are below the specified minimum amount for payments (" + PAYMENT_MINIMUM_AMOUNT + " HNT).  Payment will be saved to the DeferredPayments JSON output file.");
                                        }
                                        if (bValidWalletAddress) {
                                            paymentRecord.address = hotspotsHostsData[i].hostWallet; // The host's wallet address.
                                        } else {
                                            paymentRecord.address = hotspotsHostsData[i].name + " hosted by " + hotspotsHostsData[i].hostName; // Placeholder for the host's wallet address.
                                        }
                                        paymentRecord.amount = fHostEarnings.toFixed(HNT_DECMIAL_PLACES); // Truncate the mantissa to the 8 digits supported by Helium.
                                        paymentRecord.memo = PAYMENT_MEMO_BASE64;

                                        deferredPaymentsJSON.push(paymentRecord);
                                        consoleInfo(INFO_VERBOSE, "Added deferred payment:");
                                    }
                                    consoleInfo(INFO_VERBOSE, JSON.stringify(paymentRecord));
                                }

                                // Set grossEarnings to a string value with 8-digit mantissa, no need to keep it a Number type any longer.
                                hotspotsHostsData[i].grossEarnings = hotspotsHostsData[i].grossEarnings.toFixed(HNT_DECMIAL_PLACES);

                                consoleInfo(INFO_VERBOSE, "Appending host earnings record for " + hotspot.name);
                                // Add the host earnings record to earningsCSV.
                                earningsCSV = earningsCSV +
                                    REPORT_START_DATE.toUTC().toISO() + "," +
                                    REPORT_END_DATE.toUTC().toISO() + "," +
                                    hotspot.name + "," +
                                    "https://explorer.helium.com/hotspots/" + hotspot.address + "," +
                                    hotspotsHostsData[i].hostName + "," +
                                    hotspotsHostsData[i].hostWallet + "," +
                                    "https://explorer.helium.com/accounts/" + hotspotsHostsData[i].hostWallet + "," +
                                    hotspotsHostsData[i].grossShare + "," +
                                    hotspotsHostsData[i].netShare + "," +
                                    hotspotsHostsData[i].grossEarnings + "," +
                                    fNetEarnings.toFixed(HNT_DECMIAL_PLACES) + "," +
                                    fHostEarnings.toFixed(HNT_DECMIAL_PLACES) + "\n";  // Truncate the mantissa to the 8 digits supported by Helium.
                            } else {
                                consoleWarn("grossEarnings value not found for " + hotspot.name + " (hosted by " + hotspotsHostsData[i].hostname + ").  Check for errors in script or hotspotsHostsData JSON.");
                            }
                        }
                    } // end for each hotspotsHostsData

                } catch (e) {
                    consoleError("Retrieving transactions for hotspot " + hotspot.name);
                    consoleLog(e.stack);
                    if (e.response) {
                        if ((e.response.status === 503) || (e.response.status === 504)) {
                            consoleInfo(INFO_LOW, "503 and 504 errors indicate that the API endpoint (" + client.network.endpoint + ") may be overloaded with requests.  Try again at an off-peak time, or change the client configuration in this script to use a different API endpoint.")
                        }
                    }
                }

                iHotspots += 1;
                if (iHotspots >= MAX_HOTSPOTS) {
                    consoleInfo(INFO_MEDIUM, "Reached configurable query limit (MAX_HOTSPOTS): " + MAX_HOTSPOTS);
                    break;
                }
            } // for each hotspot-

            /*
             * Export hotspot host payments JSON.
             */
            consoleLogLabeledValue("Payments: ", paymentsJSON.length, TerminalStyles.fg.green);
            consoleInfo(INFO_VERBOSE, "paymentsJSON:");
            consoleInfo(INFO_VERBOSE, JSON.stringify(paymentsJSON));
            const PAYMENTS_JSON_FILE_NAME = "Payments_" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".json";
            appendStringToFile(JSON.stringify(paymentsJSON), "host payments", PAYMENTS_JSON_FILE_NAME);

            /*
             * Merge payments made to the same wallet.
             */
            let mergedPaymentsJSON = mergePayments(paymentsJSON);
            if (mergedPaymentsJSON.length !== paymentsJSON.length) {
                // Found at least two payments made to the same wallet.

                /*
                 * Export merged hotspot host payments JSON.
                 */
                consoleLogLabeledValue("Merged payments: ", mergedPaymentsJSON.length, TerminalStyles.fg.green);
                consoleInfo(INFO_VERBOSE, "mergedPaymentsJSON:");
                consoleInfo(INFO_VERBOSE, JSON.stringify(mergedPaymentsJSON));
                const MERGED_PAYMENTS_JSON_FILE_NAME = "PaymentsMerged_" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".json";
                appendStringToFile(JSON.stringify(mergedPaymentsJSON), "merged host payments", MERGED_PAYMENTS_JSON_FILE_NAME);
            }

            /*
             * Export deferred hotspot host payments JSON.
             */
            consoleLogLabeledValue("Deferred payments: ", deferredPaymentsJSON.length, TerminalStyles.fg.green);
            consoleInfo(INFO_VERBOSE, "deferredPaymentsJSON:");
            consoleInfo(INFO_VERBOSE, JSON.stringify(deferredPaymentsJSON));
            const DEFERRED_PAYMENTS_JSON_FILE_NAME = "DeferredPayments_" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".json";
            appendStringToFile(JSON.stringify(deferredPaymentsJSON), "deferred host payments", DEFERRED_PAYMENTS_JSON_FILE_NAME);

             /*
             * Merge payments made to the same wallet.
             */
             let mergedDeferredPaymentsJSON = mergePayments(deferredPaymentsJSON);
             if (mergedDeferredPaymentsJSON.length !== deferredPaymentsJSON.length) {
                 // Found at least two payments made to the same wallet.
 
                 /*
                  * Export merged deferred hotspot host payments JSON.
                  */
                 consoleLogLabeledValue("Merged deferred payments: ", mergedDeferredPaymentsJSON.length, TerminalStyles.fg.green);
                 consoleInfo(INFO_VERBOSE, "mergedDeferredPaymentsJSON:");
                 consoleInfo(INFO_VERBOSE, JSON.stringify(mergedDeferredPaymentsJSON));
                 const MERGED_DEFERRED_PAYMENTS_JSON_FILE_NAME = "DeferredPaymentsMerged_" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".json";
                 appendStringToFile(JSON.stringify(mergedDeferredPaymentsJSON), "merged deferred host payments", MERGED_DEFERRED_PAYMENTS_JSON_FILE_NAME);
             }

            /*
             * Export hotspot host earnings report CSV.
             */
            consoleInfo(INFO_VERBOSE, "earningsCSV:");
            consoleInfo(INFO_VERBOSE, earningsCSV);
            const EARNINGS_CSV_COLUMNS = "Period Start Time UTC,Period End Time UTC,Hotspot Name,Hotspot URL,Host Name,Host Wallet,Host Wallet URL,Gross Split,Net Split,Period Gross Earnings,Period Net Earnings,Period Host Share\n";
            const EARNINGS_FILE_NAME_CSV = "Earnings_" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".csv";
            appendStringToFile(EARNINGS_CSV_COLUMNS + earningsCSV, "host earnings report", EARNINGS_FILE_NAME_CSV);

            /*
             * Export hotspotsHostsData JSON.
             */
            consoleInfo(INFO_VERBOSE, "hotspotsHostsData:");
            consoleInfo(INFO_VERBOSE, JSON.stringify(hotspotsHostsData));
            const HOTSPOTSHOSTDATA_JSON_FILE_NAME = "HotspotsHostsData_" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".json";
            appendStringToFile(JSON.stringify(hotspotsHostsData), "hotspotsHostsData", HOTSPOTSHOSTDATA_JSON_FILE_NAME);

        } else {
            consoleWarn("Helium wallet not found: " + WALLET_ADDRESS);
        }
    } catch (e) {
        consoleError(e);
        consoleLog(e.stack);
    }

    const SCRIPT_END_TIME = DateTime.now();
    const SCRIPT_RUN_TIME = SCRIPT_END_TIME.diff(SCRIPT_START_TIME, ['minutes', 'seconds']);

    consoleLogLabeledValue("Script end time: ", SCRIPT_END_TIME.toISO(), TerminalStyles.fg.green);
    consoleLogLabeledValue("Script run time: ", SCRIPT_RUN_TIME.minutes + "m " + SCRIPT_RUN_TIME.seconds + "s", TerminalStyles.fg.green);
})().catch(e => { consoleError(e); consoleLog(e.stack); });