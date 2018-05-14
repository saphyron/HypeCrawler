const MAX_REQUESTS = 3;
const REQUEST_QUEUE = [];

class Pagepool {

    constructor(browser) {
        this.browser = browser;
        this.PAGE_POOL = [];
    }

    reservePage(url) {
        return new Promise((resolve, reject) => {
            if (this.PAGE_POOL.length < MAX_REQUESTS) { // Check if there is room for another page
                this.browser.newPage()
                    .then((newPageObject) => {
                        this.PAGE_POOL[this.PAGE_POOL.length] = {page: newPageObject, url: url};
                        resolve(newPageObject);
                    })
            }
            else {
                for (let page of this.PAGE_POOL) { // if pool is full, find empty page.
                    if (page.url === undefined) {
                        page.url = url;
                        resolve(page.page);
                        return;
                    }
                }
                REQUEST_QUEUE.push({url: url, resolve: resolve, reject: reject}) // no empty page found, add to queue.
            }
        })
    }

    releasePage(url) {
        for (let page of this.PAGE_POOL) {
            if (page.url === url) { // Release the page object handling the given url
                page.url = undefined;
                if (REQUEST_QUEUE.length > 0) { // Add a page from queue to pagepool
                    let object = REQUEST_QUEUE.shift(); // FIFO
                    page.url = object.url;
                    object.resolve(page.page);
                }
            }
        }
    }
}

module.exports = Pagepool;