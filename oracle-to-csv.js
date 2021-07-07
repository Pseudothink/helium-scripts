/*
 * Ryan Patridge
 * ryanp@splatspace.org
 * 2021-07-05
 *
 * Exports Helium oracle USD prices at block heights to CSV.
 * 
 */

const httplib = require("@helium/http");
const fs = require('fs');

const SCRIPT_START_TIME = Date.now();
const OUTPUT_FILE_NAME = "oracle_prices_" + SCRIPT_START_TIME + ".csv";
const MAX_QUERIES = 8760;  // Maximum number of queries to run against the Helium API.  Assuming maximum 24 price changes per day * 365 days * 1 API query per price change.
const LOWEST_BLOCK_INDEX = 1;  // Return block price data dating back to this block index.  Lowest possible value is 1 (the genesis block).


(async function main() {
	const client = new httplib.Client();
	//console.log(client.network.endpoint); //= https://api.helium.io/v1
	console.log("Output file: " + OUTPUT_FILE_NAME);

	let fileStream;

	try {
		fileStream = fs.openSync(OUTPUT_FILE_NAME, 'a'); // Create a stream for appending, to avoid overwriting an existing file.

		// Write column headers to the output file.
		fs.appendFileSync(fileStream, "Block Height,Price\n");

		// https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Oracle.ts
		const oOracleCurrentPrice = await client.oracle.getCurrentPrice();
		//console.log(JSON.stringify(oOracleCurrentPrice));
		/*
			* Example oracle.getCurrentPrice() and oracle.oOraclePriceAtBlock() JSON.
			*/
		/*
		{
			"price": {
				"type": {
					"ticker": "USD",
					"decimalPlaces": "8",
					"coefficient": "0.00000001"
				},
				"integerBalance": 1292555385,
				"bigInteger": "1292555385",
				"bigBalance": "12.92555385",
				"floatBalance": 12.92555385
			},
			"height": 907620
		}
		*/

		let sPrice = oOracleCurrentPrice.price.bigBalance;
		let iFromHeight = oOracleCurrentPrice.height;
		let iQueryCount = 0;

		do {
			// Write the price and height to the output file.
			fs.appendFileSync(fileStream, iFromHeight + "," + sPrice + "\n");
			console.log(iFromHeight + ": " + sPrice);

			if (iFromHeight > 1) {
				if (iFromHeight > LOWEST_BLOCK_INDEX) {
					if (iQueryCount < MAX_QUERIES) {
						const oOraclePriceAtBlock = await client.oracle.getPriceAtBlock(iFromHeight - 1); // Get the previous price and price change height.
						sPrice = oOraclePriceAtBlock.price.bigBalance;
						iFromHeight = oOraclePriceAtBlock.height;
						iQueryCount++;
					} else {
						console.log("WARNING: Reached configurable limit (MAX_QUERIES): " + MAX_QUERIES);
						break;
					}
				} else {
					console.log("WARNING: Reached configurable limit (LOWEST_BLOCK_INDEX): " + LOWEST_BLOCK_INDEX);
					break;
				}
			} else {
				break; // Reached genesis block.
			}
		} while (true)
	} catch (ex) {
		console.log("ERROR: Exporting transactions to file: " + OUTPUT_FILE_NAME);
		console.log(ex);
	} finally {
		// Close the file stream.
		if (fileStream) fs.closeSync(fileStream);
	} // try file append
		
})().catch (ex => { console.error(ex) });

