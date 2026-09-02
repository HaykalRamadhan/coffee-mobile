## 1. Core Technology

- **React Native**
- **Expo**
- **TypeScript**
- **VS Code**
- **Git + GitHub**

### Recommended libraries
- Expo Router — navigation
- Zustand — cart and local state
- TanStack Query — server/API data
- React Hook Form — forms
- Zod — validation
- AsyncStorage / SecureStore — local storage
- Expo Notifications — push notifications

---

## 2. Cloud / Backend

### Supabase
- Supabase Authentication
- PostgreSQL database
- Edge Functions
- Realtime
- Supabase Storage
- Row Level Security
- Database migrations
- CDN Image


### Supabase environments
We should eventually separate:

- Development
- Staging
- Production

---

## 3. Payment Gateway

Initial recommendation:

- **Midtrans**

Payment methods to support:

- QRIS
- GoPay
- DANA
- OVO
- ShopeePay
- Bank Virtual Account
- Credit/debit card — optional initially

We will also need:

- Midtrans merchant account
- Sandbox credentials
- Production credentials
- Server Key
- Client Key
- Webhook endpoint
- Payment verification logic

---

## 4. User Persona

### Customer
Can:

- Register/login
- Browse menu ✅
- Customize drinks ✅
- Add items to cart ✅
- Pay ⏳
- Track order ✅
- View order history ✅
- Receive notifications ⏳
- GPS Enabled ❓

### Barista / Cashier
Can:

- See incoming orders
- Accept orders
- Start preparation
- Mark orders ready
- Complete orders
- Temporarily disable unavailable items

### Admin
Can:

- Add/edit products
- Manage categories
- Set prices
- Manage modifiers
- Manage branches
- Create promotions
- View orders
- View sales
- Manage employees
- Manage menu availability

---

## 5. Customer App Screens

### Authentication

- Splash screen
- Onboarding
- Login
- Register
- Forgot password
- Guest checkout — optional

### Main application

- Home
- Branch selection
- Search
- Categories
- Menu
- Product details
- Drink customization
- Cart
- Checkout
- Payment selection
- Payment processing
- Payment result
- Order confirmation
- Live order tracking
- Order history
- Order details
- Profile
- Settings

---

## 6. Coffee Product Customization

The product system needs to support:

### Size

- Small
- Regular
- Large

### Temperature

- Hot
- Iced

### Sugar

- 0%
- 25%
- 50%
- 75%
- 100%

### Ice

- No ice
- Less ice
- Normal ice
- Extra ice

### Milk

- Fresh milk
- Oat milk
- Soy milk
- Almond milk

### Extras

- Extra espresso shot
- Syrup
- Whipped cream
- Caramel
- Additional toppings

Each modifier needs:

- Name
- Price adjustment
- Availability
- Required/optional
- Single/multiple selection

---

## 7. Menu Database

We will need collections/data models for:

### Products

- ID
- Name
- Description
- Image
- Base price
- Category
- Availability
- Branch availability
- Modifier groups

### Categories

Examples:

- Coffee
- Non-coffee
- Tea
- Food
- Pastries
- Seasonal
- Promotions

### Modifier Groups

Example:

```text
Milk Options
├── Fresh Milk       +Rp0
├── Oat Milk         +Rp7,000
└── Soy Milk         +Rp5,000
```

---

## 8. Order System

Every order should contain:

- Order ID
- Human-readable order number
- Customer ID
- Branch ID
- Items
- Product snapshots
- Modifiers
- Quantity
- Item price
- Subtotal
- Discount
- Tax
- Service charge
- Total
- Payment method
- Payment status
- Order status
- Customer notes
- Pickup/dine-in information
- Created time
- Updated time

---

## 9. Order Status Flow

```text
CREATED
   ↓
AWAITING_PAYMENT
   ↓
PAID
   ↓
CONFIRMED
   ↓
PREPARING
   ↓
READY
   ↓
COMPLETED
```

Exception statuses:

- PAYMENT_FAILED
- CANCELLED
- REFUNDED

---

## 10. Cart System

The cart needs to handle:

- Multiple products
- Product modifiers
- Quantity
- Notes
- Price calculation
- Promotions
- Voucher codes
- Tax
- Service fees
- Final total

The backend—not the mobile application—must calculate and validate the final payable amount.

---

## 11. Checkout

Customer selects:

### Order method

Initially:

- Pickup
- Dine-in

Later:

- Delivery

### Pickup

Potential options:

- ASAP
- Scheduled pickup

### Dine-in

Potential future feature:

- Table number
- QR code on table

---

## 12. Payment Architecture

```text
React Native
      ↓
Supabase Edge Function
      ↓
Midtrans
      ↓
Payment
      ↓
Midtrans Webhook
      ↓
Supabase Edge Function
      ↓
PostgreSQL
      ↓
Order Confirmed
```

Critical rule:

**The customer's phone must never decide whether payment succeeded.**

Payment confirmation comes from the payment gateway webhook.

---

## 13. Notifications

Customer notifications:

- Order received
- Payment successful
- Order accepted
- Preparing
- Ready for pickup
- Order completed
- Payment failed/cancelled

Example:

> ☕ Your order #A105 is ready for pickup.

---

## 14. Barista Application

Ideally a tablet-oriented interface.

Main screens:

- Login
- New orders
- Preparing
- Ready
- Completed
- Order detail
- Product availability

Typical flow:

```text
NEW
 ↓
ACCEPT
 ↓
PREPARING
 ↓
READY
 ↓
COMPLETE
```

---

## 15. Admin Dashboard

I recommend eventually building this as:

**Next.js + TypeScript**

rather than React Native.

Sections:

- Dashboard
- Products
- Categories
- Modifiers
- Orders
- Employees
- Branches
- Promotions
- Customers
- Analytics
- Settings

---

## 16. Promotions

Eventually support:

- Percentage discount
- Fixed discount
- Buy 1 Get 1
- Product-specific promotion
- Minimum purchase
- Voucher code
- Member-only promotion
- Time-limited promotion

Example:

```text
WELCOME20

20% discount
Maximum Rp20,000
Minimum purchase Rp50,000
```

---

## 17. Customer Loyalty

Version 2 can introduce:

- Loyalty points
- Membership
- Rewards
- Free drinks
- Birthday rewards
- Referral codes

Example:

```text
Rp10,000 spent
       ↓
1 point

100 points
       ↓
Free Coffee
```

---

## 18. Branch Management

If the coffee shop expands:

Each branch needs:

- Name
- Address
- GPS coordinates
- Opening hours
- Phone
- Active/inactive status
- Product availability
- Inventory availability
- Order capacity

Customer flow:

```text
Open App
   ↓
Choose Branch
   ↓
See Branch-Specific Menu
```

---

## 19. Images / Storage

Supabase Storage can contain:

```text
/products/
/categories/
/promotions/
/users/
/branches/
```

We should optimize images before upload to avoid unnecessary storage and bandwidth costs.

---

## 20. Security

Very important.

We will need:

- PostgreSQL Row Level Security policies
- Role-based access
- Secure API keys
- Server-side payment logic
- Webhook verification
- Request validation
- Rate limiting
- Supabase Auth JWT validation
- No secret keys inside React Native

Roles might be:

```text
CUSTOMER
BARISTA
CASHIER
MANAGER
ADMIN
SUPER_ADMIN
```

---

## 21. Business Information We Need

Before coding deeply, we should define:

- Coffee shop name
- Brand/logo
- Brand colors
- Menu
- Product prices
- Modifier prices
- Number of branches
- Operating hours
- Taxes
- Service charge
- Pickup policy
- Cancellation policy
- Refund policy

---

## 22. Accounts We Will Eventually Need

### Development

- GitHub
- Expo
- Supabase

### Production

- Google Play Console
- Apple Developer Account

### Payments

- Midtrans merchant account
- Business bank account
- QRIS merchant registration

Potential business documents may include:

- KTP
- NPWP
- NIB/business registration
- Bank details
- Business information

Exact onboarding requirements should be confirmed with the selected gateway when we register.

---

## 23. Development Environments

Recommended structure:

```text
Development
     ↓
Local testing

Staging
     ↓
Internal testers / owner

Production
     ↓
Real customers
```

Do not test new features directly on the production database.

---

## 24. Analytics

Eventually track:

- Orders per day
- Revenue
- Average order value
- Best-selling drinks
- Peak ordering times
- Repeat customers
- Payment methods
- Promotion usage
- Cancelled orders
- Conversion rate

---

## 25. MVP — What We Should Build First

For **Version 1**, I recommend limiting the scope to:

- Customer registration/login
- Branch selection
- Menu
- Categories
- Product customization
- Cart
- Checkout
- QRIS/e-wallet payment
- Payment confirmation
- Order tracking
- Push notifications
- Order history
- Basic barista dashboard
- Basic admin menu management

Do **not** initially build:

- Delivery
- Loyalty points
- Membership tiers
- Referral program
- Advanced inventory
- AI recommendations
- Complex accounting
- Multi-level promotions

Those can come later.

---

# Proposed Overall Stack

```text
CUSTOMER MOBILE APP
React Native
Expo
TypeScript
        │
        ▼
SUPABASE
├── Authentication
├── PostgreSQL
├── Edge Functions
├── Realtime
└── Storage
        │
        ├─────────────► MIDTRANS
        │                ├── QRIS
        │                ├── GoPay
        │                ├── DANA
        │                ├── OVO
        │                └── VA
        │
        ▼
BARISTA APP
React Native / Expo
        │
        ▼
ADMIN DASHBOARD
Next.js
        │
        ▼
ANALYTICS / REPORTING
```

## Recommended build order

**Phase 1 — Foundation**

```text
React Native project
→ Navigation
→ Supabase
→ Authentication
→ Database models
```

**Phase 2 — Ordering**

```text
Menu
→ Product
→ Modifiers
→ Cart
→ Checkout
```

**Phase 3 — Payment**

```text
Midtrans Sandbox
→ Supabase Edge Function
→ Payment
→ Webhook
→ Payment confirmation
```

**Phase 4 — Coffee Shop Operations**

```text
Barista dashboard
→ Order status
→ Push notifications
```

**Phase 5 — Administration**

```text
Admin dashboard
→ Products
→ Prices
→ Promotions
→ Reports
```

This gives us a clean MVP first while keeping the architecture ready for a significantly larger coffee-shop platform later.
