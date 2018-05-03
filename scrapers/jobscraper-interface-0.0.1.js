const ORM = require('../data/general-orm-1.0.0');
const puppeteer = require('puppeteer');
const sha1 = require('sha1');
const annonceModel = require('../model/annonce');
const regionModel = require('../model/region');


// Constants:
let PAGE_LIMIT;
const ADVERTS_PER_PAGE = 20;

/**
 * Class representing a generic jobscraper algorithm.
 */
class JocscraperTemplate {

    /**
     * Constructor for JobscraperTemplate.
     * @class JobscraperTemplate
     *
     * @param {String}              targetWebsite           website to be scraped (ex. https://www.xyz.ab)
     * @param {Map<key, value>}     regionNames             map object to conform to database standard
     * @param {String}              regionNames.key         name of database entry
     * @param {String}              regionNames.value       string containing path to specific region
     * @param {Object}              xPathVariations         object containing HTML classes and paths to advertisements
     * @param {String}              numberRegex             regex to filter the text containing the number of pages.
     */
    constructor(targetWebsite, regionNames, xPathVariations, numberRegex) {
        const TARGET_WEBSITE = targetWebsite;
        const REGION_NAMES = regionNames;
        const PATH_VARIATIONS = xPathVariations;
        const PAGE_NUMBER_TEXT_REGEX = numberRegex;
    }

    /**
     * Entry-point method used by main-method for access to the scraper.
     *
     * @since       1.0.0
     * @access      private
     *
     * @param {Object} page - Represents a tab in Chromium browser.
     * @param {Object} browser - The Chromium browser.
     * @param {int} pageLimit - User provided safeguard for parallel run.
     * @returns {Promise<void>}
     */
    async beginScraping(page, browser, pageLimit) {
        global.PAGE_LIMIT = 5;
        console.log(PAGE_LIMIT);
        try {
            for(let [key, value] of REGION_NAMES) {
                console.log(key.toString());
                currentRegionObject = await ORM.FindRegionID(key.toString());
                currentRegionID = currentRegionObject[0].region_id;

                console.log(`BEGINNING SCRAPING IN REGION: ${key}`);
                const REGION_PAGE_SELECTOR = `${TARGET_WEBSITE}${value}`;


                await page.goto(REGION_PAGE_SELECTOR)
                    .catch((error) => {
                        throw new Error("Error at beginScraping → page.goto(): " + error);
                    });

                const NUM_PAGES = await getNumPages(page, ADVERTS_PER_PAGE);

                for (let pageNumber = 0; pageNumber < NUM_PAGES; pageNumber += PAGE_LIMIT) {
                    await scrapeRegion(page, browser, REGION_PAGE_SELECTOR, pageNumber, pageNumber + PAGE_LIMIT);
                }
            }
        } catch (error) {
            console.log("Error at beginScraping → " + error);
        }
    }

let TARGET_WEBSITE = 'https://www.careerjet.dk';
const REGION_NAMES = new Map([
    ['storkoebenhavn', '/wsog/jobs?l=Storkøbenhavn&lid=270167&b='],
    ['region-sjaelland', '/wsog/jobs?l=Sjælland&lid=268728&b='],
    ['region-nordjylland', '/wsog/jobs?l=Nordjylland&lid=268731&b='],
    ['region-midtjylland', '/wsog/jobs?l=Midtjylland&lid=268730&b='],
    ['sydjylland', '/wsog/jobs?l=Syddanmark&lid=268729&b='],
    ['bornholm', '/wsog/jobs?l=Bornholm&lid=268760&b=']
]);
}

// Varies:

