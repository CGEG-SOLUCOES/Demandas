const firebaseConfig = {
  apiKey: "AIzaSyAHOxSCJLqptWGWIuXsfxI2zqNKNagaQuw",
  authDomain: "cgeg-demandas.firebaseapp.com",
  projectId: "cgeg-demandas",
  storageBucket: "cgeg-demandas.firebasestorage.app",
  messagingSenderId: "441209663613",
  appId: "1:441209663613:web:ba117ad3c1dff6121d0114"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
window.auth = auth;
window.db   = db;