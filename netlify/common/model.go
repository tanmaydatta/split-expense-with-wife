package common

import (
	"encoding/json"
	"time"
)

type User struct {
	Id        int32
	Username  string
	FirstName string
	Groupid   int32
}

type Session struct {
	Username   string
	Sessionid  string
	ExpiryTime time.Time
}

type Group struct {
	Groupid  int32
	Budgets  string
	Userids  string
	Metadata json.RawMessage
}

type BudgetEntry struct {
	Id          int32      `json:"id"`
	Description string     `json:"description"`
	AddedTime   time.Time  `json:"added_time"`
	Price       string     `json:"price"`
	Amount      float64    `json:"amount"`
	Name        string     `json:"name"`
	Deleted     *time.Time `json:"deleted"`
	Groupid     int32      `json:"groupid"`
	Currency    string     `json:"currency"`
}

type Transaction struct {
	Id            int32           `json:"id"`
	Description   string          `json:"description"`
	Amount        float64         `json:"amount"`
	CreatedAt     time.Time       `json:"created_at"`
	Metadata      json.RawMessage `json:"metadata"`
	Currency      string          `json:"currency"`
	TransactionId string          `json:"transaction_id"`
	GroupId       int32           `json:"group_id"`
	Deleted       *time.Time      `json:"deleted"`
}

type TransactionUser struct {
	TransactionId string     `json:"transaction_id"`
	UserId        int32      `json:"user_id"`
	Amount        float64    `json:"amount"`
	OwedToUserId  int32      `json:"owed_to_user_id"`
	GroupId       int32      `json:"group_id"`
	Currency      string     `json:"currency"`
	Deleted       *time.Time `json:"deleted"`
}

type TransactionMetadata struct {
	PaidByShares  map[string]float64 `json:"paidByShares"`
	OwedAmounts   map[string]float64 `json:"owedAmounts"`
	OwedToAmounts map[string]float64 `json:"owedToAmounts"`
}

func (BudgetEntry) TableName() string {
	return "finances_db.budget"
}

func (User) TableName() string {
	return "finances_db.users"
}

func (Session) TableName() string {
	return "finances_db.sessions"
}

func (Group) TableName() string {
	return "finances_db.groups"
}

func (Transaction) TableName() string {
	return "finances_db.transactions"
}

func (TransactionUser) TableName() string {
	return "finances_db.transaction_users"
}

var Currencies = []string{
	"USD",
	"EUR",
	"GBP",
	"INR",
}
