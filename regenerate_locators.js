import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(__dirname, 'src/config/locators.json');

const content = {
    "gigantti": {
        "searchInput": "#speedy-header-search",
        "cookieBannerAccept": "button.coi-banner__accept",
        "categoryLink": "[data-test='main-navigation'] a[href*='/tietokoneet']",
        "productCard": "[data-testid='product-card']",
        "searchButton": "[data-testid='search-button']",
        "navLink": "nav a:has-text('{}'), header a:has-text('{}')",
        "productTitle": [
            ".ProductPageHeader"
        ],
        "productPrice": [
            "[data-cro=\"pdp-main-price-box\"]"
        ]
    }
};

fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
console.log('Regenerated locators.json at', filePath);
