export const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))
export const formatDate = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—'
export const discountPercent = (price, mrp) => {
  const sellingPrice = Number(price)
  const maximumRetailPrice = Number(mrp)
  if (!Number.isFinite(sellingPrice) || !Number.isFinite(maximumRetailPrice) || maximumRetailPrice <= sellingPrice || maximumRetailPrice <= 0) return 0
  return Math.round(((maximumRetailPrice - sellingPrice) / maximumRetailPrice) * 10000) / 100
}
export const productImage = (product, index = 0) => {
  if (product?.images?.[index]?.url) return product.images[index].url
  const seed = product?.slug || product?.uid || 'product'
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/400`
}

export const orderItemImage = (item) => {
  if (item?.image_url) return item.image_url
  if (item?.images?.[0]?.url) return item.images[0].url
  if (item?.product?.images?.[0]?.url) return item.product.images[0].url
  const seed = item?.product_slug || item?.product_id || item?.title_snapshot || item?.uid || 'order-item'
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/400`
}
