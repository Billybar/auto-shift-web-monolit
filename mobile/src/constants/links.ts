import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

// Public pages live only on the web app; mobile opens them in an in-app browser.
export const PRIVACY_POLICY_URL = 'https://autoshift.co.il/privacy';
export const SUPPORT_URL = 'https://autoshift.co.il/support';

const openInAppBrowser = async (url: string) => {
  await openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
};

export const openPrivacyPolicy = () => openInAppBrowser(PRIVACY_POLICY_URL);
export const openSupport = () => openInAppBrowser(SUPPORT_URL);
