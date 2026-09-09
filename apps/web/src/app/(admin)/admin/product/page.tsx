import { Suspense } from "react";
import { ProductClient } from "@/components/admin/product-client";

export default function AdminProductPage() {
  return (
    <Suspense fallback={null}>
      <ProductClient />
    </Suspense>
  );
}
