const STOCK_ADMIN_CONFIG = Object.freeze({
  ENVIRONMENT: "PRODUCTION",
  EXPECTED_ENVIRONMENT: "PRODUCTION",
  API_BASE_URL: "https://script.google.com/macros/s/AKfycbxAUJH4m8TFDK8e2FRFx2zdAe3VWo_U5i6dYvzP92aFbxr-0tyXNQgwYjbpWPSjLN2n/exec",
});

document.documentElement.dataset.stockAdminEnvironment = STOCK_ADMIN_CONFIG.ENVIRONMENT;
document.documentElement.dataset.stockAdminApiBaseUrl = STOCK_ADMIN_CONFIG.API_BASE_URL;
