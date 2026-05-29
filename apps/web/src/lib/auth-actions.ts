import {
  type ActionCodeSettings,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, githubProvider, googleProvider } from "@/lib/firebase";

const MAGIC_LINK_EMAIL_KEY = "claimit:emailForSignIn";

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithGithub() {
  return signInWithPopup(auth, githubProvider);
}

export async function signOutUser() {
  return signOut(auth);
}

export async function sendMagicLink(email: string) {
  const settings: ActionCodeSettings = {
    url: `${window.location.origin}/login/verify`,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, settings);
  window.localStorage.setItem(MAGIC_LINK_EMAIL_KEY, email);
}

export function isMagicLinkUrl(url: string) {
  return isSignInWithEmailLink(auth, url);
}

export function getStashedMagicLinkEmail() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MAGIC_LINK_EMAIL_KEY);
}

export async function completeMagicLinkSignIn(email: string, url: string) {
  const result = await signInWithEmailLink(auth, email, url);
  window.localStorage.removeItem(MAGIC_LINK_EMAIL_KEY);
  return result;
}
