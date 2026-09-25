import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

// The privacy policy lives only on the web app; mobile opens it in an in-app browser.
export const PRIVACY_POLICY_URL = 'https://autoshift.co.il/privacy';

export const openPrivacyPolicy = async () => {
  await openBrowserAsync(PRIVACY_POLICY_URL, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
};
