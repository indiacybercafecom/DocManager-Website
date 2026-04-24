import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from 'firebase/auth';
import { ref, set, get, child } from 'firebase/database';
import { auth, db } from '../lib/firebase';
import { motion } from 'motion/react';
import { FileText, Loader2, Eye, EyeOff, User, Mail, Phone, Lock } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // For Login: Identifier can be email or mobile
  const [identifier, setIdentifier] = useState('');

  const cleanMobile = (m: string) => {
    const cleaned = m.replace(/\D/g, '');
    // Take last 10 digits if longer (common for handling country codes like +91)
    return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        let loginEmail = identifier;
        
        // If it looks like a mobile number (no @)
        if (!identifier.includes('@')) {
          const m = cleanMobile(identifier);
          if (m.length >= 10) {
            // First try the fast lookup map
            const lookupSnapshot = await get(child(ref(db), `mobile_lookup/${m}`));
            if (lookupSnapshot.exists()) {
              loginEmail = lookupSnapshot.val();
            } else {
              // Fallback: This user might have registered before the lookup map was added
              // We'll perform a query on the users node (slower but necessary for backward sync)
              const usersRef = ref(db, 'users');
              const usersSnapshot = await get(usersRef);
              let foundEmail = null;
              
              if (usersSnapshot.exists()) {
                const users = usersSnapshot.val();
                for (const uid in users) {
                  if (users[uid].mobile === m) {
                    foundEmail = users[uid].email;
                    // Auto-repair: Save to lookup map for next time
                    await set(ref(db, `mobile_lookup/${m}`), foundEmail);
                    break;
                  }
                }
              }
              
              if (foundEmail) {
                loginEmail = foundEmail;
              } else {
                throw new Error('No account found with this mobile number');
              }
            }
          } else {
            throw new Error('Please enter a valid email or 10-digit mobile number');
          }
        }
        
        await signInWithEmailAndPassword(auth, loginEmail, password);
      } else {
        // Register
        if (!email.includes('@')) throw new Error('Please enter a valid email');
        if (cleanMobile(mobile).length < 10) throw new Error('Please enter a valid 10-digit mobile number');

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update profile
        await updateProfile(user, { displayName: fullName });

        // Save user to Realtime Database
        await set(ref(db, `users/${user.uid}`), {
          fullName,
          email,
          mobile: cleanMobile(mobile),
          uid: user.uid,
          createdAt: new Date().toISOString()
        });

        // Save mobile lookup
        await set(ref(db, `mobile_lookup/${cleanMobile(mobile)}`), email);
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || 'An error occurred';
      if (msg.includes('auth/invalid-credential')) msg = 'Invalid email/mobile or password';
      if (msg.includes('auth/email-already-in-use')) msg = 'Email already registered';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-2 mb-8">
        <div className="bg-[#2563EB] p-2 rounded-lg shadow-lg">
          <FileText className="text-white w-8 h-8" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-[#0F172A]">DocManager</span>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[32px] shadow-2xl border border-[#E2E8F0] w-full max-w-[400px]"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                <User className="w-4 h-4 text-[#2563EB]" /> Full Name
              </label>
              <input
                required
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-5 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all font-medium"
              />
            </div>
          )}

          {isLogin ? (
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#2563EB]" /> Email or Mobile
              </label>
              <input
                required
                type="text"
                placeholder="E-mail or Mobile Number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-5 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all font-medium"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#2563EB]" /> Email Address
                </label>
                <input
                  required
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#2563EB]" /> Mobile Number
                </label>
                <input
                  required
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full px-5 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all font-medium"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#2563EB]" /> Password
            </label>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all font-medium pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#2563EB] transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-xs font-medium px-1">{error}</p>}

          <button
            disabled={loading}
            type="submit"
            className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white py-4 rounded-full font-bold text-base transition-all shadow-lg active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Login' : 'Create Account')}
          </button>

          <div className="text-center pt-4 border-t border-[#E2E8F0] mt-4">
            <p className="text-sm text-[#64748B]">
              {isLogin ? "Don't have an account?" : "Already a member?"}{' '}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-[#B91C1C] font-bold hover:underline"
              >
                {isLogin ? 'Register' : 'Login'}
              </button>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
