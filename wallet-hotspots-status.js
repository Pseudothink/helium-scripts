/*
 * Ryan Patridge
 * ryanp@splatspace.org
 * 2021-10-10
 *
 * Exports status information for hotspots associated with a specified wallet.
 * Note: set "MAX_HOTSPOTS" to a higher value, if needed.
 * 
 */

const httplib = require("@helium/http");
const fs = require("fs");
const { DateTime } = require("luxon"); // for datetime manipulation.
const WALLET_ADDRESS = '13H9ykhRaWw8AVEMqf7rV6Fn9fnLXxZ6G98JEdsA1gdcJKYqQYW'; // Replace this with a particular 51-character wallet ID

const MAX_HOTSPOTS = 25;  // change as needed
const SCRIPT_START_TIME = DateTime.now();

(async function main() {
    try {
        const client = new httplib.Client();

        //console.log(client.network.endpoint); //= https://api.helium.io/v1

        // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Accounts.ts
        const account = await client.accounts.fromAddress(WALLET_ADDRESS); // Get the account for this wallet.

        if (account) {
            // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Hotspots.ts
            // https://github.com/helium/helium-js/blob/master/packages/http/src/models/Hotspot.ts
            // https://github.com/helium/helium-js/blob/master/packages/http/src/ResourceList.ts
            const hotspots = await account.hotspots.list(); // List hotspots for the specified account.  Returns all at once (not paginated).
            //console.log(JSON.stringify(hotspots));

            /*
             * Example hotspots ResourceList JSON.
             */
            /*
            {
                "data": [Hotspot, Hotspot, ...]
            }
             */

            let iHotspots = 0;
            var bOutputFileExists = true;

            const OUTPUT_FILE_NAME = "Hotspots_" + WALLET_ADDRESS + "_Status.csv";
            console.log("Exporting hotspot status information to: " + OUTPUT_FILE_NAME);

            // Check if the output file already exists.
            try {
                 var fd = fs.openSync(OUTPUT_FILE_NAME, 'r');
            } catch (err) {
                if (err.code === 'ENOENT') {
                    bOutputFileExists = false;
                } else {
                    throw err;
                }
            } finally {
                if (fd) {
                    fs.closeSync(fd);
                }
            }

            let fileStream;
            let outCSV = "";
            
            try {
                fileStream = fs.openSync(OUTPUT_FILE_NAME, "a"); // Create a stream for appending, to avoid overwriting an existing file.

                if (!bOutputFileExists) {
                    // Write column headers to the output file.
                    fs.appendFileSync(fileStream, "Date (UTC),Time (UTC),Name,Online,Height,Block,LastPocChallenge,LastChangeBlock,BlockAdded,RewardScale,Gain,Elevation,Address\n");
                }
               
                for (const hotspot of hotspots.data) {
                    /*
                     * Example hotspot JSON.
                     */
                    /*
                    {
                        "client": {
                            "network": {
                                "baseURL": "https://api.helium.io",
                                "version": 1
                            },
                            "retry": 5
                        },
                        "rewardScale": 0.80645751953125,
                        "owner": "14b3zTWdeiYueJx6vuyC9UVJBrvx2FX3Y5sGqJTc44yJFCi7JTo",
                        "name": "trendy-grey-worm",
                        "location": "8c2ad6d2c0f15ff",
                        "lng": -78.85130915556415,
                        "lat": 35.83589399242602,
                        "block": 904783,
                        "status": {
                            "gps": "",
                            "height": 904694,
                            "online": "online",
                            "listenAddrs": ["/ip4/136.56.6.56/tcp/44158"]
                        },
                        "nonce": 4,
                        "blockAdded": 465868,
                        "timestampAdded": "2020-08-23T16:40:36.000000Z",
                        "lastPocChallenge": 904401,
                        "lastChangeBlock": 904772,
                        "gain": 12,
                        "elevation": 0,
                        "geocode": {
                            "shortStreet": "Point Comfort Ln",
                            "shortState": "NC",
                            "shortCountry": "US",
                            "shortCity": "Cary",
                            "longStreet": "Point Comfort Lane",
                            "longState": "North Carolina",
                            "longCountry": "United States",
                            "longCity": "Cary",
                            "cityId": "Y2FyeW5vcnRoIGNhcm9saW5hdW5pdGVkIHN0YXRlcw"
                        },
                        "address": "112VNJtZVeDjEMp3NN6msjzq3Tqb7BbZ4rVLKzHtK8PKn23bofUM"
                    }
                    */

                    outCSV = outCSV + SCRIPT_START_TIME.toUTC().toISODate() + "," +
                        SCRIPT_START_TIME.toUTC().toISOTime({ includeOffset: false }) + "," +
                        hotspot.name + "," +
                        hotspot.status.online + "," +
                        hotspot.status.height + "," +
                        hotspot.block + "," +
                        hotspot.lastPocChallenge + "," +
                        hotspot.lastChangeBlock + "," +
                        hotspot.blockAdded + "," +
                        hotspot.rewardScale + "," +
                        hotspot.gain + "," +
                        hotspot.elevation + "," +
                        hotspot.address + "\n";

                    iHotspots++;
                    if (iHotspots >= MAX_HOTSPOTS) {
                        console.log("WARNING: Reached configurable limit (MAX_HOTSPOTS): " + MAX_HOTSPOTS);
                        break;
                    }
                } // for each hotspot
                
                //console.log(outCSV);

                // Append a record to the output file.
                fs.appendFileSync(fileStream, outCSV);
            } catch (ex) {
                console.log("ERROR: Exporting hotpot status to file: " + OUTPUT_FILE_NAME);
                console.log(ex);
            } finally {
                if (fileStream) fs.closeSync(fileStream);
                console.log("Exported " + iHotspots + " rows.");
            } // try file append
        } else {
            console.log("ERROR: Account not found: " + WALLET_ADDRESS);
        }
    } catch (ex) {
        console.log(ex);
    }
})().catch(ex => { console.error(ex) });