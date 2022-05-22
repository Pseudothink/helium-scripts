/*
 * Ryan Patridge
 * ryanp@splatspace.org
 * 2021-08-08
 *
 * Exports Helium hotspot data for specified cityIds.
 * 
 */

const httplib = require("@helium/http");
const { Console } = require("console");
const fs = require('fs');

// North Carolina cityIds for Apex, Cary, Chapel Hill, Durham, Knightdale, Morrisville, Raleigh
const cityIds = ['bG9zIGFuZ2VsZXNjYWxpZm9ybmlhdW5pdGVkIHN0YXRlcw']; // Los Angeles, 2300+ hotspots
/*
const cityIds = ['YXBleG5vcnRoIGNhcm9saW5hdW5pdGVkIHN0YXRlcw',
    'Y2FyeW5vcnRoIGNhcm9saW5hdW5pdGVkIHN0YXRlcw',
    'Y2hhcGVsIGhpbGxub3J0aCBjYXJvbGluYXVuaXRlZCBzdGF0ZXM',
    'ZHVyaGFtbm9ydGggY2Fyb2xpbmF1bml0ZWQgc3RhdGVz',
    'a25pZ2h0ZGFsZW5vcnRoIGNhcm9saW5hdW5pdGVkIHN0YXRlcw',
    'bW9ycmlzdmlsbGVub3J0aCBjYXJvbGluYXVuaXRlZCBzdGF0ZXM',
    'cmFsZWlnaG5vcnRoIGNhcm9saW5hdW5pdGVkIHN0YXRlcw'];
*/
const MAX_HOTSPOTS = 3000;
const MAX_HOTSPOTS_PER_CITY = 2000;
const MAX_HOTSPOTS_PAGES_PER_CITY = 200;
const HOTSPOTS_PAGE_SIZE = 10;
const TRANSACTIONS_PAGE_SIZE = 1000;
const MAX_TRANSACTIONS_PAGES = 100000;
const SCRIPT_START_TIME = Date.now();
const ONE_DAY_AGO = new Date().setDate(SCRIPT_START_TIME) - 1;
const SEVEN_DAYS_AGO = new Date().setDate(SCRIPT_START_TIME) - 7;
const THIRTY_DAYS_AGO = new Date().setDate(SCRIPT_START_TIME) - 30;

(async function main() {
    let iHotspots = 0;
    let fileStream;

    const OUTPUT_FILE_NAME = "Cities_Hotspots_" + SCRIPT_START_TIME + ".csv";
    console.log("Exporting hotspots to: " + OUTPUT_FILE_NAME)

	try {
        fileStream = fs.openSync(OUTPUT_FILE_NAME, 'a'); // Create a stream for appending, to avoid overwriting an existing file.
        // Write column headers to the output file.
        fs.appendFileSync(fileStream, "Name,Rewards1,Rewards7,Rewards30,Online,Height,Gps,Block,LastPocChallenge,LastChangeBlock,RewardScale,Location,Lat,Lng,Country,State,City,Street,Gain,Elevation,TimeStampAdded,Address,Owner\n");

        const client = new httplib.Client();

		//console.log(client.network.endpoint); //= https://api.helium.io/v1

        // List all hotspots in each specified cityId.
        for (const cityId of cityIds) {
            console.log("cityId: " + cityId)

            // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Hotspots.ts
            // https://github.com/helium/helium-js/blob/master/packages/http/src/models/Hotspot.ts
            // https://github.com/helium/helium-js/blob/master/packages/http/src/ResourceList.ts
            // Note: client.city.hotspots.list() returns up to 1000 results all at once, in one page.  
            // If there are more than 1000, results the returned data has a "cursor" property at the end.
            // Note: this does not retrive a full city object, just a stub pointing to the cityId, used by Hotspots.ts to search for hotspots.
            const hotspots = await client.city(cityId).hotspots.list();  

            //console.log(JSON.stringify(hotspots));
            /*
                {
                    "data": [{Hotspot},{Hotspot},...,{Hotspot}],
                    "cursor": "eyJoZWlnaHQiOjk1OTA3NiwiZmlsdGVyX21vZGVzIjpbImZ1bGwiLCJsaWdodCIsImRhdGFvbmx5Il0sImJlZm9yZV9ibG9jayI6ODkxNzkyLCJiZWZvcmVfYWRkcmVzcyI6IjExMlFVSzNBYWU5V1VMVzNRTFBNVG5LWEhGcW02NllFNVhKZ2s2NGVxNjh2dGhYZk1IclcifQ"
                }
             */
            
break;
            let iCityHotspots = 0;
            let iCityHotspotsPages = 0;

            do {
                const hotspotsPage = await hotspots.take(HOTSPOTS_PAGE_SIZE);
                //console.log(JSON.stringify(hotspotsPage));

                for (const hotspot of hotspotsPage) {  
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

                    // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Transactions.ts
                    // https://github.com/helium/helium-js/blob/master/packages/http/src/models/Transaction.ts
                    // https://github.com/helium/helium-js/blob/master/packages/http/src/ResourceList.ts
                    //const transactions = await hotspot.activity.list({
                    //    filterTypes: ['payment_v1','payment_v2','rewards_v1','rewards_v2','poc_receipts_v1' ]
                    //  });
                    //const transactions = await hotspot.activity.list();

                    const transactions = await hotspot.activity.list({
                        filterTypes: ['rewards_v1', 'rewards_v2']
                    });
                    //console.log(JSON.stringify(transactions));

                    /* 
                    * Example transactions ResourceList JSON.
                    */
                    /*
                    {
                        "type": "rewards_v2",
                        "time": 1625266597,
                        "startEpoch": 904785,
                        "rewards": [{
                            "type": "data_credits",
                            "gateway": "112EkjffyXdNdLFQMcghKaK5TtwsajSaFG9rE3KSMjaH1RStjAyS",
                            "amount": {
                                "type": {
                                    "ticker": "HNT",
                                    "decimalPlaces": "8",
                                    "coefficient": "0.00000001"
                                },
                                "integerBalance": 164,
                                "bigInteger": "164",
                                "bigBalance": "0.00000164",
                                "floatBalance": 0.00000164
                            },
                            "account": "14b3zTWdeiYueJx6vuyC9UVJBrvx2FX3Y5sGqJTc44yJFCi7JTo"
                        }],
                        "height": 904822,
                        "hash": "RlfgVMzpn6JQ5WAxf56FtsiWjTKNWbfASXnA4BotcEA",
                        "endEpoch": 904821,
                        "totalAmount": {
                            "type": {
                                "ticker": "HNT",
                                "decimalPlaces": "8",
                                "coefficient": "0.00000001"
                            },
                            "integerBalance": 164,
                            "bigInteger": "164",
                            "bigBalance": "0.00000164",
                            "floatBalance": 0.00000164
                        }
                    }
                        */

                    let iTransactionPages = 0;
                    let floatRewards1 = 0;
                    let floatRewards7 = 0;
                    let floatRewards30 = 0;

                    try {
                        do {
                            const transactionsPage = await transactions.take(TRANSACTIONS_PAGE_SIZE);
                            //console.log(JSON.stringify(transactionsPage));

                            for (const transaction of transactionsPage) {
                                let transactionTime = new Date(transaction.time * 1000);  // Transaction time is in seconds, not milliseconds expected by Date.

                                // Remember to add floatRewards1 to floatRewards7 and floatRewards30, and floatRewards7 to floatRewards30, afterward.
                                if (transactionTime < THIRTY_DAYS_AGO) {
                                    break;
                                } else if (transactionTime < SEVEN_DAYS_AGO) {
                                    floatRewards30 += transaction.totalAmount.floatBalance;
                                } else if (transactionTime < ONE_DAY_AGO) {
                                    floatRewards7 += transaction.totalAmount.floatBalance;
                                } else {
                                    floatRewards1 += transaction.totalAmount.floatBalance;
                                }
                            } // for each transaction

                            iTransactionPages++;
                            if (iTransactionPages >= MAX_TRANSACTIONS_PAGES) {
                                console.log("WARNING: Reached configurable limit (MAX_TRANSACTIONS_PAGES): " + iTransactionPages);
                                floatRewards7 = -1;
                                floatRewards30 = -1;
                            }
                        } while (transactions.hasMore && iTransactionPages < MAX_TRANSACTIONS_PAGES)

                        floatRewards7 += floatRewards1
                        floatRewards30 += floatRewards7
                    } catch (ex) {
                        console.log("ERROR: Exporting rewards for hotspot: " + hotspot.name);
                        console.log(ex);
                        floatRewards1 = -1;
                        floatRewards7 = -1;
                        floatRewards30 = -1;
                    } 

                    let outCSV = "";
                
                    outCSV = hotspot.name + "," +
                            floatRewards1 + "," +
                            floatRewards7 + "," +
                            floatRewards30 + "," +
                            hotspot.status.online + "," +
                            hotspot.status.height + "," +
                            JSON.stringify(hotspot.status.gps) + "," +
                            //hotspot.status.timestamp + "," +
                            hotspot.block + "," +
                            hotspot.lastPocChallenge + "," +
                            hotspot.lastChangeBlock + "," +
                            //hotspot.score + "," +
                            //hotspot.scoreUpdateHeight + "," +
                            hotspot.rewardScale + "," +
                            hotspot.location + "," +
                            //hotspot.locationHex + "," +
                            hotspot.lat + "," +
                            hotspot.lng + "," +
                            hotspot.geocode.shortCountry + "," +
                            hotspot.geocode.shortState + "," +
                            hotspot.geocode.shortCity + "," +
                            hotspot.geocode.shortStreet + "," +
                            hotspot.gain + "," +
                            hotspot.elevation + "," +
                            //hotspot.mode + "," +
                            hotspot.timestampAdded + "," +
                            hotspot.address + "," +
                            hotspot.owner + "\n";
                    
                    // Append a record to the output file.
                    fs.appendFileSync(fileStream, outCSV);

                    iCityHotspots++;
                    iHotspots++;
                    
                    if (iHotspots >= MAX_HOTSPOTS) {
                        console.log("WARNING: Reached configurable limit (MAX_HOTSPOTS): " + iHotspots);
                        break;
                    }
                    if (iCityHotspots >= MAX_HOTSPOTS_PER_CITY) {
                        console.log("WARNING: Reached configurable limit (MAX_HOTSPOTS_PER_CITY): " + iCityHotspots);
                        break;
                    }
                } // for each hotspot

                console.log("Hotspots: " + iCityHotspots);
                iCityHotspotsPages++;

                if (iCityHotspotsPages >= MAX_HOTSPOTS_PAGES_PER_CITY) {
                    console.log("WARNING: Reached configurable limit (MAX_HOTSPOTS_PAGES): " + iCityHotspotsPages);
                    break;
                }
            } while (hotspots.hasMore && iHotspots < MAX_HOTSPOTS && iCityHotspots < MAX_HOTSPOTS_PER_CITY && iCityHotspotsPages < MAX_HOTSPOTS_PAGES_PER_CITY)
            
            if (iHotspots >= MAX_HOTSPOTS) {
                break;
            }
	    } // For each cityId
    } catch (ex) {
        console.log("ERROR: Exporting hotspots to file: " + OUTPUT_FILE_NAME);
        console.log(ex);
    } finally {
        // Close the file stream.
        if (fileStream) fs.closeSync(fileStream);
    } // try file append
})().catch(ex => { console.error(ex) });