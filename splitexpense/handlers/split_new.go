package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"slices"
	"strconv"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type SplitNewRequest struct {
	Amount         float64            `json:"amount"`
	Description    string             `json:"description"`
	PaidByShares   map[string]float64 `json:"paidByShares"`
	Pin            string             `json:"pin"`
	SplitPctShares map[string]float64 `json:"splitPctShares"`
	Currency       string             `json:"currency"`

	SplitPctSharesByUserId map[int32]float64 `json:"-"`
	PaidBySharesByUserId   map[int32]float64 `json:"-"`
}

func SplitNewHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req SplitNewRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if req.Pin != os.Getenv("AUTH_PIN") {
		http.Error(w, "invalid pin", http.StatusServiceUnavailable)
		return
	}

	if err := validateSplitRequest(&req, session); err != nil {
		log.Default().Println(err)
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	txn, txnUsers, err := createDBRecord(req, session)
	if err != nil {
		log.Default().Println(err)
		http.Error(w, "error occurred", http.StatusServiceUnavailable)
		return
	}

	err = saveTransactionToDB(txn, txnUsers)
	if err != nil {
		log.Default().Println(err)
		http.Error(w, "error occurred saving in db", http.StatusServiceUnavailable)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Success split"))
}

func validateSplitRequest(req *SplitNewRequest, session *common.CurrentSession) error {
	if !slices.Contains(common.Currencies, req.Currency) {
		return fmt.Errorf("invalid currency")
	}
	if req.Amount <= 0 {
		return fmt.Errorf("invalid amount")
	}
	if req.Description == "" {
		return fmt.Errorf("invalid description")
	}
	req.PaidBySharesByUserId = make(map[int32]float64)

	paidByIds := make([]int32, 0, len(req.PaidByShares))
	for k, v := range req.PaidByShares {
		if v < 0 {
			return fmt.Errorf("invalid paidByShares")
		}
		id, err := strconv.ParseInt(k, 10, 32)
		if err != nil {
			return err
		}
		paidByIds = append(paidByIds, int32(id))
		req.PaidBySharesByUserId[int32(id)] = v
	}
	slices.Sort(paidByIds)
	userIds := []int32{}
	err := json.Unmarshal([]byte(session.Group.Userids), &userIds)
	if err != nil {
		return err
	}
	slices.Sort(userIds)
	for _, id := range paidByIds {
		if !slices.Contains(userIds, id) {
			return fmt.Errorf("invalid paidByShares")
		}
	}

	totalAmount := 0.0
	for _, v := range req.PaidByShares {
		totalAmount += v
	}
	if totalAmount != req.Amount {
		return fmt.Errorf("invalid paidByShares")
	}
	splitIds := make([]int32, 0, len(req.SplitPctShares))
	req.SplitPctSharesByUserId = make(map[int32]float64)
	totalPct := 0.0
	for k, v := range req.SplitPctShares {
		id, err := strconv.ParseInt(k, 10, 32)
		if err != nil {
			return err
		}
		if v < 0 || v > 100 {
			return fmt.Errorf("invalid splitPctShares")
		}
		totalPct += v
		splitIds = append(splitIds, int32(id))
		req.SplitPctSharesByUserId[int32(id)] = v
	}
	slices.Sort(splitIds)
	if slices.Compare(splitIds, userIds) != 0 {
		return fmt.Errorf("invalid splitIds")
	}

	if totalPct != 100.0 {
		return fmt.Errorf("invalid splitPctShares")
	}
	return nil
}

func getSplitAmounts(req SplitNewRequest) ([]common.TransactionUser, error) {
	amounts := []common.TransactionUser{}
	owed := make(map[int32]float64)
	totalOwed := 0.0
	owedToUserIds := []int32{}
	for k, v := range req.SplitPctSharesByUserId {
		o := req.PaidBySharesByUserId[k] - (req.Amount * v / 100)
		owed[k] = o
		if o >= 0 {
			owedToUserIds = append(owedToUserIds, k)
			totalOwed += o
		}
	}
	for k, v := range owed {
		// credit
		if v > 0 {
			continue
		}
		for _, owedToUserId := range owedToUserIds {
			amt := 0.0
			if totalOwed != 0 {
				amt = math.Abs(owed[owedToUserId] / totalOwed * v)
			}
			amounts = append(amounts, common.TransactionUser{
				UserId:       k,
				Amount:       amt,
				OwedToUserId: owedToUserId,
				Currency:     req.Currency,
			})
		}
	}
	return amounts, nil
}

func createDBRecord(req SplitNewRequest, session *common.CurrentSession) (common.Transaction, []common.TransactionUser, error) {
	transaction := common.Transaction{
		Amount:      req.Amount,
		Description: req.Description,
		Currency:    req.Currency,
		CreatedAt:   common.SQLiteTime{Time: time.Now()},
		GroupId:     session.Group.Groupid,
	}
	transactionId, err := common.GenerateRandomID(16)
	if err != nil {
		return transaction, nil, err
	}
	transaction.TransactionId = transactionId
	metadata := common.TransactionMetadata{
		PaidByShares:  req.PaidByShares,
		OwedAmounts:   make(map[string]float64),
		OwedToAmounts: make(map[string]float64),
	}
	m, err := json.Marshal(metadata)
	if err != nil {
		return transaction, nil, err
	}
	transaction.Metadata = string(m)
	transactionUsers, err := getSplitAmounts(req)
	if err != nil {
		return transaction, transactionUsers, err
	}
	for i, _ := range transactionUsers {
		transactionUsers[i].TransactionId = transactionId
		transactionUsers[i].GroupId = session.Group.Groupid
	}
	return transaction, transactionUsers, nil
}

func saveTransactionToDB(txn common.Transaction, txnUsers []common.TransactionUser) error {
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Fatal("DSN_D1 environment variable not set")
		return fmt.Errorf("DSN_D1 environment variable not set")
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return err
	}
	return commitTransaction(db, txn, txnUsers)
}

func commitTransaction(db *gorm.DB, txn common.Transaction, txnUsers []common.TransactionUser) error {
	err := db.Transaction(func(tx *gorm.DB) error {
		// Create the main transaction record
		if err := tx.Create(&txn).Error; err != nil {
			return err
		}
		// Create the transaction user records
		if err := tx.Create(&txnUsers).Error; err != nil {
			return err
		}
		return nil
	})
	return err
}
