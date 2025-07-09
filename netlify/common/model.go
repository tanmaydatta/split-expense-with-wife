package common

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// SQLiteTime is a custom type that handles SQLite datetime string conversion
type SQLiteTime struct {
	Time time.Time
}

// Scan implements the sql.Scanner interface for reading from database
func (st *SQLiteTime) Scan(value interface{}) error {
	if value == nil {
		st.Time = time.Time{}
		return nil
	}

	switch v := value.(type) {
	case string:
		// Try multiple datetime formats that SQLite might use
		formats := []string{
			"2006-01-02 15:04:05",
			"2006-01-02T15:04:05",
			"2006-01-02 15:04:05.000",
			"2006-01-02T15:04:05.000Z",
			"2006-01-02T15:04:05Z",
			time.RFC3339,
		}

		for _, format := range formats {
			if t, err := time.Parse(format, v); err == nil {
				st.Time = t
				return nil
			}
		}
		return fmt.Errorf("cannot parse datetime string: %s", v)
	case time.Time:
		st.Time = v
		return nil
	default:
		return fmt.Errorf("cannot scan %T into SQLiteTime", value)
	}
}

// Value implements the driver.Valuer interface for writing to database
func (st SQLiteTime) Value() (driver.Value, error) {
	if st.IsZero() {
		return nil, nil
	}
	return st.Time.Format("2006-01-02 15:04:05"), nil
}

// MarshalJSON implements the json.Marshaler interface
func (st SQLiteTime) MarshalJSON() ([]byte, error) {
	if st.IsZero() {
		return []byte("null"), nil
	}
	result, err := json.Marshal(st.Time.Format("2006-01-02 15:04:05"))
	return result, err
}

// UnmarshalJSON implements the json.Unmarshaler interface
func (st *SQLiteTime) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s == "null" {
		st.Time = time.Time{}
		return nil
	}

	// Try multiple datetime formats (same as Scan method)
	formats := []string{
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05.000",
		"2006-01-02T15:04:05.000Z",
		"2006-01-02T15:04:05Z",
		time.RFC3339,
	}

	for _, format := range formats {
		if t, err := time.Parse(format, s); err == nil {
			st.Time = t
			return nil
		}
	}
	return fmt.Errorf("cannot parse datetime string: %s", s)
}

// NewSQLiteTime creates a new SQLiteTime pointer from time.Time
func NewSQLiteTime(t time.Time) *SQLiteTime {
	return &SQLiteTime{Time: t}
}

// Before reports whether the time instant st is before u.
func (st SQLiteTime) Before(u time.Time) bool {
	return st.Time.Before(u)
}

// IsZero reports whether st represents the zero time instant.
func (st SQLiteTime) IsZero() bool {
	return st.Time.IsZero()
}

// Format returns a textual representation of the time value formatted according to layout.
func (st SQLiteTime) Format(layout string) string {
	return st.Time.Format(layout)
}

type User struct {
	Id        int32
	Username  string
	FirstName string
	Groupid   int32
}

type Session struct {
	Username   string
	Sessionid  string
	ExpiryTime SQLiteTime
}

type Group struct {
	Groupid  int32
	Budgets  string
	Userids  string
	Metadata string
}

type BudgetEntry struct {
	Id          int32       `json:"id"`
	Description string      `json:"description"`
	AddedTime   SQLiteTime  `json:"added_time"`
	Price       string      `json:"price"`
	Amount      float64     `json:"amount"`
	Name        string      `json:"name"`
	Deleted     *SQLiteTime `json:"deleted"`
	Groupid     int32       `json:"groupid"`
	Currency    string      `json:"currency"`
}

type Transaction struct {
	Id            int32       `json:"id"`
	Description   string      `json:"description"`
	Amount        float64     `json:"amount"`
	CreatedAt     SQLiteTime  `json:"created_at"`
	Metadata      string      `json:"metadata"`
	Currency      string      `json:"currency"`
	TransactionId string      `json:"transaction_id"`
	GroupId       int32       `json:"group_id"`
	Deleted       *SQLiteTime `json:"deleted"`
}

type TransactionUser struct {
	TransactionId string      `json:"transaction_id"`
	UserId        int32       `json:"user_id"`
	Amount        float64     `json:"amount"`
	OwedToUserId  int32       `json:"owed_to_user_id"`
	GroupId       int32       `json:"group_id"`
	Currency      string      `json:"currency"`
	Deleted       *SQLiteTime `json:"deleted"`
}

type TransactionMetadata struct {
	PaidByShares  map[string]float64 `json:"paidByShares"`
	OwedAmounts   map[string]float64 `json:"owedAmounts"`
	OwedToAmounts map[string]float64 `json:"owedToAmounts"`
}

func (BudgetEntry) TableName() string {
	return "budget"
}

func (User) TableName() string {
	return "users"
}

func (Session) TableName() string {
	return "sessions"
}

func (Group) TableName() string {
	return "groups"
}

func (Transaction) TableName() string {
	return "transactions"
}

func (TransactionUser) TableName() string {
	return "transaction_users"
}

var Currencies = []string{
	"USD",
	"EUR",
	"GBP",
	"INR",
}
