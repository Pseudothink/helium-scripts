/*
 * Ryan Patridge
 * ryanp@splatspace.org
 * 2021-08-08
 *
 * Exports cities with Helium hotspots.
 * 
 */

const httplib = require("@helium/http");
const fs = require('fs');

const MAX_PAGES = 20;
const PAGE_SIZE = 500;
const SCRIPT_START_TIME = Date.now();

(async function main() {
	try {
		const client = new httplib.Client();

		//console.log(client.network.endpoint); //= https://api.helium.io/v1

        // https://github.com/helium/helium-js/blob/master/packages/http/src/resources/Cities.ts
        // https://github.com/helium/helium-js/blob/master/packages/http/src/models/City.ts
        // https://github.com/helium/helium-js/blob/master/packages/http/src/ResourceList.ts
            //const cities = await client.cities.list({
            //    search: ['san francisco','san diego' ]
            //  });
        const cities = await client.cities.list(); // List all cities.
        //console.log(JSON.stringify(cities));

        const OUTPUT_FILE_NAME = "Cities_" + SCRIPT_START_TIME + ".csv";
        console.log("Exporting cities to: " + OUTPUT_FILE_NAME);
        
        let iPages = 0;
        let iResults = 0;
        let bLimitReached = false;
        let fileStream;

        try {
            fileStream = fs.openSync(OUTPUT_FILE_NAME, 'a'); // Create a stream for appending, to avoid overwriting an existing file.

            // Write column headers to the output file.
            fs.appendFileSync(fileStream, "CityId,Hotspots,Country,State,City,LongCountry,LongState,LongCity\n");

            do {
                const citiesPage = await cities.take(PAGE_SIZE);
                //console.log(JSON.stringify(citiesPage));

                for (const city of citiesPage) {

                    let outCSV = "";
                
                    outCSV = city.cityId + "," +
                            city.hotspotCount + "," +
                            city.shortCountry + "," +
                            city.shortState + "," +
                            city.shortCity + "," +
                            city.longCountry + "," +
                            city.longState + "," +
                            city.longCity + "\n";

                    //console.log(outCSV);
                
                    // Append a record to the output file.
                    fs.appendFileSync(fileStream, outCSV);
                    iResults++;
                } // for each city

                iPages++;
                console.log("Results " + iResults);
            } while (!bLimitReached && cities.hasMore && iPages < MAX_PAGES)
        } catch (ex) {
            console.log("ERROR: Exporting cities to file: " + OUTPUT_FILE_NAME);
            console.log(ex);
        } finally {
            // Close the file stream.
            if (fileStream) fs.closeSync(fileStream);
        } // try file append
	} catch (ex) {
		console.log(ex);
	}
})().catch(ex => { console.error(ex) });