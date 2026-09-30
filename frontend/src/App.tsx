import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

// Public
import PublicLayout from "@/components/layouts/PublicLayout";
import Home from "@/pages/public/Home";
import About from "@/pages/public/About";
import HowItWorks from "@/pages/public/HowItWorks";
import Security from "@/pages/public/Security";
import Privacy from "@/pages/public/Privacy";
import FAQ from "@/pages/public/FAQ";
import Contact from "@/pages/public/Contact";
import LoginHub from "@/pages/public/LoginHub";
import Results from "@/pages/public/Results";
import SystemStatus from "@/pages/public/SystemStatus";

// Voter
import VoterLayout, { LogoutPage } from "@/components/layouts/VoterLayout";
import VoterLogin from "@/pages/voter/Login";
import VoterRegister from "@/pages/voter/Register";
import VerifyIdentity from "@/pages/voter/VerifyIdentity";
import FaceVerification from "@/pages/voter/FaceVerification";
import Liveness from "@/pages/voter/Liveness";
import VoterDashboard from "@/pages/voter/Dashboard";
import VoterElections from "@/pages/voter/Elections";
import VoterElectionDetailPage from "@/pages/voter/ElectionDetail";
import CandidateDetail from "@/pages/voter/CandidateDetail";
import Ballot from "@/pages/voter/Ballot";
import VoteSuccess from "@/pages/voter/VoteSuccess";
import Receipts from "@/pages/voter/Receipts";
import VoteVerification from "@/pages/voter/VoteVerification";
import VoterProfile from "@/pages/voter/Profile";
import VoterSecurity from "@/pages/voter/Security";

// Admin
import AdminLayout from "@/components/layouts/AdminLayout";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminElections from "@/pages/admin/Elections";
import AdminElectionDetailPage from "@/pages/admin/ElectionDetail";
import AdminConstituencies from "@/pages/admin/Constituencies";
import AdminCandidates from "@/pages/admin/Candidates";
import AdminVoters from "@/pages/admin/Voters";
import AdminVoterDetail from "@/pages/admin/VoterDetail";
import Eligibility from "@/pages/admin/Eligibility";
import VotingMonitor from "@/pages/admin/VotingMonitor";
import FraudMonitor from "@/pages/admin/FraudMonitor";
import SecurityMonitor from "@/pages/admin/SecurityMonitor";
import AuditLogs from "@/pages/admin/AuditLogs";
import Blockchain from "@/pages/admin/Blockchain";
import AdminResults from "@/pages/admin/Results";
import Reports from "@/pages/admin/Reports";
import AdminSettingsPage from "@/pages/admin/Settings";
import AdminUsers from "@/pages/admin/AdminUsers";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        {/* A. Public website + E. public results portal + F. system status */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/security" element={<Security />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<LoginHub />} />
          <Route path="/results" element={<Results />} />
        </Route>
        <Route path="/system-status" element={<SystemStatus />} />

        {/* B. Voter portal — unauthenticated entry points */}
        <Route path="/voter-login" element={<VoterLogin />} />
        <Route path="/voter/login" element={<VoterLogin />} />
        <Route path="/voter/register" element={<VoterRegister />} />
        <Route path="/voter/logout" element={<LogoutPage />} />

        {/* B. Voter portal — authenticated */}
        <Route path="/voter" element={<VoterLayout />}>
          <Route path="dashboard" element={<VoterDashboard />} />
          <Route path="verify-identity" element={<VerifyIdentity />} />
          <Route path="face-verification" element={<FaceVerification />} />
          <Route path="liveness" element={<Liveness />} />
          <Route path="elections" element={<VoterElections />} />
          <Route path="election/:id" element={<VoterElectionDetailPage />} />
          <Route path="candidates/:id" element={<CandidateDetail />} />
          <Route path="ballot/:id" element={<Ballot />} />
          <Route path="review-vote" element={<VoterElections />} />
          <Route path="vote-success" element={<VoteSuccess />} />
          <Route path="receipt" element={<Receipts />} />
          <Route path="vote-verification" element={<VoteVerification />} />
          <Route path="profile" element={<VoterProfile />} />
          <Route path="security" element={<VoterSecurity />} />
        </Route>

        {/* C. Admin portal */}
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/logout" element={<LogoutPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="elections" element={<AdminElections />} />
          <Route path="elections/create" element={<AdminElections />} />
          <Route path="elections/:id" element={<AdminElectionDetailPage />} />
          <Route path="elections/:id/edit" element={<AdminElectionDetailPage />} />
          <Route path="constituencies" element={<AdminConstituencies />} />
          <Route path="candidates" element={<AdminCandidates />} />
          <Route path="voters" element={<AdminVoters />} />
          <Route path="voters/:id" element={<AdminVoterDetail />} />
          <Route path="eligibility" element={<Eligibility />} />
          <Route path="voting-monitor" element={<VotingMonitor />} />
          <Route path="fraud-monitor" element={<FraudMonitor />} />
          <Route path="security" element={<SecurityMonitor />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="blockchain" element={<Blockchain />} />
          <Route path="results" element={<AdminResults />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="admin-users" element={<AdminUsers />} />
        </Route>

        {/* Fallback — never leave a URL rendering blank */}
        <Route element={<PublicLayout />}>
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
      <Toaster richColors />
    </>
  );
}
