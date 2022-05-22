// 2022-05-22: Script not working yet, still under development.

const axios = require('axios'); // For HTTP requests
const { DateTime, Duration } = require("luxon"); // For Datetime manipulation: https://moment.github.io/luxon/api-docs/index.html
const SCRIPT_START_TIME = DateTime.now();
const httplib = require("@helium/http"); // Helium Javascript HTTP API: https://github.com/helium/helium-js/
const fs = require("fs");  // Node file system API: https://nodejs.org/api/fs.html

// https://github.com/helium/helium-js/blob/master/packages/http/src/Network.ts
// https://docs.helium.com/api/blockchain/introduction/
// Helium beta/testing API endpoint
//const apiEndpoint = new httplib.Network({
//    baseURL: 'https://api.helium.wtf',
//    version: 1,
//});
// Helium production API endpoint
const apiEndpoint = new httplib.Network({
    baseURL: 'https://api.helium.io',
    version: 1,
});
// Stakejoy production API endpoint, https://helium-api.stakejoy.com
//const apiEndpoint = new httplib.Network({
//    baseURL: 'https://helium-api.stakejoy.com',
//    version: 1,
//});

const DISPLAY_INFO_LEVEL = 1;  // Amount of status information to display in stdout: 0 = low, 1 = medium, 2 = verbose
const DISPLAY_CONSOLE_COLORS = true;  // Set false for unformatted stdout text.

const REPORT_START_DATE_STRING = "2021-12-01T00:00:00.000Z"; // The earliest transaction date to include in the report.
const REPORT_END_DATE_STRING = "2022-04-01T00:00:00.000Z"; // Include transactions up to (but excluding) this date.
// Create datetime values from provided string values.
const REPORT_START_DATE = DateTime.fromISO(REPORT_START_DATE_STRING);
const REPORT_END_DATE = DateTime.fromISO(REPORT_END_DATE_STRING);

const REWARDS_FILE_SUFFIX = "-Rewards-" + REPORT_START_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "-" + REPORT_END_DATE.toUTC().toFormat("yyyyMMddHHmmss") + "_" + SCRIPT_START_TIME.toFormat("yyyyMMddhhmmss") + ".json";

const CURSOR_FETCH_DELAY_MS = 30000;

const WALLET_ADDRESS = "13shErS29gws7ikVxkb4s13PZ6sQLSY63xRKP8DEBww2qWFhUu5"; // Wallet address here

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

const consoleInfo = (infoLevel, text, showTimestamp = false) => {
    if (infoLevel <= DISPLAY_INFO_LEVEL) {
        if (DISPLAY_CONSOLE_COLORS) {
            if (showTimestamp) {
                console.log(`${TerminalStyles.dim}${TerminalStyles.fg.white}%s INFO: %s${TerminalStyles.reset}`, DateTime.now().toISOTime({ suppressMilliseconds: true, includeOffset: false }), text);
            } else {
                console.log(`${TerminalStyles.dim}${TerminalStyles.fg.white}INFO: %s${TerminalStyles.reset}`, text);
            }
        } else {
            if (showTimestamp) {
                console.log(DateTime.now().toISOTime({ suppressMilliseconds: true, includeOffset: false }) + " INFO: " + text);    
            } else {
                console.log(DateTime.now().toISOTime("INFO: " + text)); 
            }
        }
    }
};
const consoleWarn = (text, showTimestamp = false) => {
    if (DISPLAY_CONSOLE_COLORS) {
        if (showTimestamp) {
            console.warn(`${TerminalStyles.fg.yellow}%s WARNING: %s${TerminalStyles.reset}`, DateTime.now().toISOTime({ suppressMilliseconds: true, includeOffset: false }), text);
        } else {
            console.warn(`${TerminalStyles.fg.yellow}WARNING: %s${TerminalStyles.reset}`, text);
        }
    } else {
        if (showTimestamp) {
            console.warn(DateTime.now().toISOTime({ suppressMilliseconds: true, includeOffset: false }) + " WARNING: " + text);    
        }
        else {
            console.warn("WARNING: " + text);
        }
    }
};
const consoleError = (text, showTimestamp = false) => {
    if (DISPLAY_CONSOLE_COLORS) {
        if (showTimestamp) {
            console.error(`${TerminalStyles.fg.red}%s ERROR: %s${TerminalStyles.reset}`, DateTime.now().toISOTime({ suppressMilliseconds: true, includeOffset: false }), text);
        } else {
            console.error(`${TerminalStyles.fg.red}ERROR: %s${TerminalStyles.reset}`, text);
        }
    } else {
        if (showTimestamp) {
            console.error(DateTime.now().toISOTime({ suppressMilliseconds: true, includeOffset: false }) + " ERROR: " + text);
        } else {
            console.error("ERROR: " + text);
        }
    }
};


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


async function makeGetRequest(getURL) {
    return(await axios.get(getURL));
/*
    return (
        await axios.get(getURL).catch(error => {
            console.log(error);
        })
    );
    */
}

// await sleep(1000)
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// address is a B58 address, mintime and maxtime are ISO 8621 formatted dates (like "2021-12-01")
async function getHotspotRewards(name, address, mintime, maxtime, cursor = '') {
    // Single-thread this for now, but could issue simultaneous requests later.
    
    let sGetUrl = [apiEndpoint.baseURL, `v${apiEndpoint.version}`].join('/') + '/hotspots/' + address + '/rewards?min_time=' + mintime + '&max_time=' + maxtime;

    if (cursor.length > 0) {
        sGetUrl = sGetUrl + '&cursor=' + cursor;
    }

    consoleInfo(INFO_MEDIUM, "Fetching: " + sGetUrl, true);

    axios.get(sGetUrl)
    .then(async resp => {
        // For each reward returned...
        if (resp.data.data) {
            consoleInfo(INFO_MEDIUM, "Processing " + resp.data.data.length + " rewards.", true);
            // Convert returned JSON object array into array of strings.
            if (resp.data.data.length > 0) {
                let srRewards = [];
                for (const reward of resp.data.data) {
                    srRewards.push(JSON.stringify(reward));
                }
                appendStringToFile(srRewards.join('\r\n'), "host payments", name + REWARDS_FILE_SUFFIX);
            }
        }
        if (resp.data.cursor) {
            //consoleInfo(INFO_MEDIUM, "Returned cursor " + resp.data.cursor, true);
            if (resp.data.cursor.length > 0){
                consoleInfo(INFO_MEDIUM, "Recursing: " + [name, mintime, maxtime, resp.data.cursor].join(' '), true);
                await sleep(CURSOR_FETCH_DELAY_MS);
                return new Promise((resolve) => { resolve(resp.data.data.length + await getHotspotRewards(name, address, mintime, maxtime, resp.data.cursor)) });

                //return(await getHotspotRewards(name, address, mintime, maxtime, resp.data.cursor));
            } else {
                return new Promise((resolve) => { resolve(resp.data.data.length) });
            }
        } else {
            return new Promise((resolve) => { resolve(resp.data.data.length) });
        }
    })
    .catch(err => {
        // Handle Error Here
        console.error(err);
    });

}

// https://docs.helium.com/api/blockchain/accounts
// https://api.helium.io/v1/accounts/:address/hotspots

(async function main() {
    let sGetUrl = 'https://api.helium.io/v1/accounts/' + WALLET_ADDRESS + '/hotspots';
    axios.get(sGetUrl)
    .then(async resp => {
        // For each hotspot returned...
        for (const hotspot of resp.data.data) {
            console.log(hotspot.name + "\n" + hotspot.address)
            let returnedRewards = await getHotspotRewards(hotspot.name, hotspot.address, REPORT_START_DATE.toUTC().toFormat("yyyy-MM-dd"), REPORT_END_DATE.toUTC().toFormat("yyyy-MM-dd"));
            consoleInfo(INFO_MEDIUM, "Finished " + hotspot.name + ": " + returnedRewards + " rewards.", true);
            //await sleep(CURSOR_FETCH_DELAY_MS);
        }
    })
    .catch(err => {
        // Handle Error Here
        console.error(err);
    });

})().catch(e => { consoleError(e); consoleLog(e.stack); showHttpErrorInfo(e); });