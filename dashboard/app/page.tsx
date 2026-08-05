import Footer from "@/components/Footer";
import Header from "@/components/Header";
import PaymentsTable from "@/components/PaymentsTable";
import VaultStatus from "@/components/VaultStatus";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <Header />
      <VaultStatus />
      <PaymentsTable />
      <Footer />
    </div>
  );
}
