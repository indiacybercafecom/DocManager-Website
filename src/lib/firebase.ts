import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBBw3UT1vFYfUevIQj5TGG3oF4nIavLm1w",
  authDomain: "documents-manager-website.firebaseapp.com",
  databaseURL: "https://documents-manager-website-default-rtdb.firebaseio.com",
  projectId: "documents-manager-website",
  storageBucket: "documents-manager-website.firebasestorage.app",
  messagingSenderId: "842134092310",
  appId: "1:842134092310:web:2852fdcd084c99c1fa9337"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export default app;
