/*
 * Ryan Patridge
 * ryanp@splatspace.org
 * 2021-07-04
 *
 * Exports Helium reward transactions for all hotspots associated with a specified wallet.
 * 
 */

const httplib = require("@helium/http");
const fs = require('fs');
const WALLET_ADDRESS = '13H9ykhRaWw8AVEMqf7rV6Fn9fnLXxZ6G98JEdsA1gdcJKYqQYW'; // Replace this with a particular 51-character wallet ID

const MAX_HOTSPOTS = 10;
const MAX_TRANSACTIONS_PAGES = 20;
const TRANSACTIONS_PAGE_SIZE = 500;
const SCRIPT_START_TIME = Date.now();
const LOWEST_BLOCK_INDEX = 468000;  // Return block price data dating back to this block index.  Lowest possible value is 1 (the genesis block).
const EARLIEST_DATE_UTC_STRING = '01 Aug 2020'; // Return transactions back to this date.
const EARLIEST_DATE_UTC = Date.parse(EARLIEST_DATE_UTC_STRING); // Return transactions back to this date.

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

            for (const hotspot of hotspots.data) {
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

                const OUTPUT_FILE_NAME = "Hotspot_" + hotspot.name + "_" + hotspot.address + "_" + SCRIPT_START_TIME + ".csv";
                console.log("Exporting transactions to: " + OUTPUT_FILE_NAME);
                
                let iTransactionPages = 0;
                let bLimitReached = false;
                let fileStream;

                try {
                    fileStream = fs.openSync(OUTPUT_FILE_NAME, 'a'); // Create a stream for appending, to avoid overwriting an existing file.

                    // Write column headers to the output file.
                    fs.appendFileSync(fileStream, "Date,Received Quantity,Received Currency,Reward Type,Block,Hash\n");

                    do {
                        const transactionsPage = await transactions.take(TRANSACTIONS_PAGE_SIZE);
                        //console.log(JSON.stringify(transactionsPage));

                        for (const transaction of transactionsPage) {
                            let transactionTime = new Date(transaction.time * 1000);  // Transaction time is in seconds, not milliseconds expected by Date.

                            if (transactionTime < EARLIEST_DATE_UTC) {
                                console.log("WARNING: Reached configurable limit (EARLIEST_DATE_UTC_STRING): " + EARLIEST_DATE_UTC_STRING);
                                bLimitReached = true;
                                break;
                            }
                            if (transaction.height < LOWEST_BLOCK_INDEX) {
                                console.log("WARNING: Reached configurable limit (LOWEST_BLOCK_INDEX): " + LOWEST_BLOCK_INDEX);
                                bLimitReached = true;
                                break;
                            }

                            let outCSV = "";  // Collect the CSV export rows for any rewards associated with this transaction.
                        
                            for (const reward of transaction.rewards) {
                                let rewardAmountBigBalance;
                                let rewardAmountTypeTicker;
                                if (reward.amount) {
                                    rewardAmountBigBalance = reward.amount.bigBalance;

                                    if (reward.amount.type) {
                                        rewardAmountTypeTicker = reward.amount.type.ticker;
                                    } else {
                                        console.log("Warning: Undefined reward amount type: " + JSON.stringify(reward));
                                    }
                                } else {
                                    console.log("Warning: Undefined reward amount: " + JSON.stringify(reward));
                                }

                                outCSV = outCSV + transactionTime.toISOString() + "," +
                                    rewardAmountBigBalance + "," +
                                    rewardAmountTypeTicker + "," +
                                    reward.type + "," +
                                    transaction.height + "," +
                                    transaction.hash + "\n";
                            } // for each transaction reward

                            //console.log(outCSV);
                        
                            // Append a record to the output file.
                            fs.appendFileSync(fileStream, outCSV);
                            
                        } // for each transaction

                        iTransactionPages++;
                    } while (!bLimitReached && transactions.hasMore && iTransactionPages < MAX_TRANSACTIONS_PAGES)
                } catch (ex) {
                    console.log("ERROR: Exporting transactions to file: " + OUTPUT_FILE_NAME);
                    console.log(ex);
                } finally {
                    // Close the file stream.
                    if (fileStream) fs.closeSync(fileStream);
                } // try file append
                
                iHotspots++;
                if (iHotspots >= MAX_HOTSPOTS) {
                    console.log("WARNING: Reached configurable limit (MAX_HOTSPOTS): " + MAX_HOTSPOTS);
                    break;
                }
			} // for each hotspot
		} else {
			console.log("ERROR: Account not found: " + WALLET_ADDRESS);
		}
	} catch (ex) {
		console.log(ex);
	}
})().catch(ex => { console.error(ex) });